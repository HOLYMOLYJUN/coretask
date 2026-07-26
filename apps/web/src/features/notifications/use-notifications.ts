import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { useSession } from '@/features/auth/session'

export type Notif = Tables['notifications']['Row'] & {
  actor: { name: string } | null
  task: { title: string } | null
  project: { name: string } | null
}

/**
 * RLS(notif_read)가 이미 본인 것만 보여주지만, user_id 필터를 명시한다.
 * "RLS 는 볼 수 있는 것을 정하고, 내 것은 쿼리가 좁힌다" — 이 규칙에 예외를 만들면
 * 어느 쿼리에 필터가 필요한지 매번 다시 생각해야 한다.
 */
export function useNotifications() {
  const { userId } = useSession()
  return useQuery({
    queryKey: qk.notifications(),
    enabled: !!userId,
    queryFn: async (): Promise<Notif[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select(
          '*, actor:profiles!notifications_actor_id_fkey(name), task:tasks(title), project:projects(name)',
        )
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as Notif[]
    },
  })
}

/** 벨 뱃지 — 포커스 복귀 시 재조회가 갱신 수단이다 (D-035) */
export function useUnreadCount() {
  const { userId } = useSession()
  return useQuery({
    queryKey: [...qk.notifications(), 'unread'],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId!)
        .is('read_at', null)
      return count ?? 0
    },
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications() }),
  })
}

export function useMarkAllRead() {
  const { userId } = useSession()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId!)
        .is('read_at', null)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications() }),
  })
}

/** 알림 문구 — 무엇이 일어났고, 누가 그랬는가 */
export function notifText(n: Notif): string {
  const who = n.actor?.name ? `${n.actor.name}님이 ` : ''
  switch (n.type) {
    case 'task_assigned':
      return (n.payload as { claimed?: boolean } | null)?.claimed
        ? `${who}업무를 가져갔어요`
        : '새 업무가 배정되었습니다'
    case 'review_requested':
      return `${who}리뷰를 요청했습니다`
    case 'task_completed':
      return '업무가 완료 확정되었습니다'
    case 'task_rejected':
      return '반려되었습니다 — 사유를 확인하세요'
    case 'task_commented':
      return `${who}댓글을 남겼어요`
    case 'task_mentioned':
      return `${who}나를 언급했어요`
    case 'tasks_unassigned': {
      const c = (n.payload as { count?: number } | null)?.count
      return `팀원이 나가면서 업무 ${c ?? '여러 '}건이 미배정되었습니다`
    }
    case 'due_soon':
      return '내일이 마감이에요'
    case 'due_passed':
      return '마감이 지났어요'
    default:
      return '알림'
  }
}

/** 모든 알림은 반드시 특정 화면으로 착지한다 (User Flow §8) */
export function notifDestination(n: Notif): string {
  if (n.type === 'tasks_unassigned' && n.project_id) return `/projects/${n.project_id}/board`
  if (n.task_id) return `/tasks/${n.task_id}`
  if (n.project_id) return `/projects/${n.project_id}/board`
  return '/tasks'
}
