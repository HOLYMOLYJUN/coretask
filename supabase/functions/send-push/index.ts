// core_task · send-push Edge Function (US-802 · D-037)
//
// 호출 경로 2개:
//   1. Database Webhook — notifications INSERT 시 { type:'INSERT', record: {...} }
//   2. retry-push cron  — { notification_id } (pushed_at 이 비어 있는 것 재시도)
//
// 처리:
//   알림 행 → 문구 구성 → 그 사용자의 push_subscriptions 전부에 발송
//   성공 → notifications.pushed_at 기록 (재시도 대상에서 제외)
//   404/410 → 만료된 구독이므로 삭제
//
// 페이로드는 클릭 시 착지할 url 을 반드시 포함한다 (User Flow §8).

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // 클라이언트에는 절대 없는 키 — 여기가 유일한 사용처다 (API §5)
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

interface NotifRecord {
  id: string
  user_id: string
  type: string
  task_id: string | null
  project_id: string | null
  actor_id: string | null
  payload: Record<string, unknown> | null
}

// use-notifications.ts 의 notifText 와 같은 매핑 — 서버는 프론트 코드를 못 쓰므로 중복이 불가피하다.
// 문구를 바꿀 때는 두 곳을 함께 바꾼다.
function buildText(n: NotifRecord, actor: string | null): { title: string; needsTask: boolean } {
  const who = actor ? `${actor}님이 ` : ''
  switch (n.type) {
    case 'task_assigned':
      return n.payload?.claimed
        ? { title: `${who}업무를 가져갔어요`, needsTask: true }
        : { title: '새 업무가 배정되었습니다', needsTask: true }
    case 'review_requested':
      return { title: `${who}리뷰를 요청했습니다`, needsTask: true }
    case 'task_completed':
      return { title: '업무가 완료 확정되었습니다', needsTask: true }
    case 'task_rejected':
      return { title: '반려되었습니다 — 사유를 확인하세요', needsTask: true }
    case 'task_commented':
      return { title: `${who}댓글을 남겼어요`, needsTask: true }
    case 'task_mentioned':
      return { title: `${who}나를 언급했어요`, needsTask: true }
    case 'tasks_unassigned':
      return {
        title: `팀원이 나가면서 업무 ${n.payload?.count ?? '여러 '}건이 미배정되었습니다`,
        needsTask: false,
      }
    case 'due_soon':
      return { title: '내일이 마감이에요', needsTask: true }
    case 'due_passed':
      return { title: '마감이 지났어요', needsTask: true }
    default:
      return { title: '새 알림', needsTask: false }
  }
}

function destination(n: NotifRecord): string {
  if (n.type === 'tasks_unassigned' && n.project_id) return `/projects/${n.project_id}/board`
  if (n.task_id) return `/tasks/${n.task_id}`
  if (n.project_id) return `/projects/${n.project_id}/board`
  return '/tasks'
}

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const id: string | undefined = body?.record?.id ?? body?.notification_id
    if (!id) return new Response('missing notification id', { status: 400 })

    const { data: n } = await supabase
      .from('notifications')
      .select('id, user_id, type, task_id, project_id, actor_id, payload, pushed_at')
      .eq('id', id)
      .maybeSingle()
    if (!n) return new Response('not found', { status: 404 })
    if (n.pushed_at) return new Response('already pushed', { status: 200 })

    // 문구 재료
    const [actorRes, taskRes] = await Promise.all([
      n.actor_id
        ? supabase.from('profiles').select('name').eq('id', n.actor_id).maybeSingle()
        : Promise.resolve({ data: null }),
      n.task_id
        ? supabase.from('tasks').select('title').eq('id', n.task_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const { title } = buildText(n as NotifRecord, actorRes.data?.name ?? null)
    const payload = JSON.stringify({
      title,
      body: taskRes.data?.title ?? '',
      url: destination(n as NotifRecord),
      tag: n.id, // 같은 알림의 재시도가 중복 표시되지 않게
    })

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', n.user_id)

    if (!subs?.length) {
      // 구독 기기가 없다 = 보낼 곳이 없다. 재시도해도 소용없으니 완료로 표시한다.
      await supabase.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', n.id)
      return new Response('no subscriptions', { status: 200 })
    }

    let delivered = 0
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        delivered++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // 만료된 기기 — 쌓이면 발송만 느려진다 (API §5.2)
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
        }
        // 그 외 실패는 pushed_at 을 남기지 않아 retry-push cron 이 다시 시도한다
      }
    }

    if (delivered > 0) {
      await supabase.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', n.id)
    }

    return new Response(JSON.stringify({ delivered, total: subs.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error(e)
    return new Response('error', { status: 500 })
  }
})
