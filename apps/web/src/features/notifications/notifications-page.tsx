import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BellOff, BellRing, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner, EmptyState, Button } from '@/components/ui'
import { relativeTime } from '@/lib/date'
import { useSession } from '@/features/auth/session'
import { pushState, enablePush, type PushState } from './push'
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  notifText,
  notifDestination,
  type Notif,
} from './use-notifications'
import { cn } from '@/lib/cn'

/**
 * US-801 인앱 알림.
 * 데스크톱은 벨에서, 모바일은 하단 탭에서 진입한다 (IA §3.7).
 * 알림 클릭 = 읽음 처리 + 해당 화면으로 착지.
 */
/**
 * 푸시 켜기 배너 (US-802).
 * 문구는 "설정하세요" 가 아니라 이득을 말한다 (User Flow §2).
 * 권한이 미설정인 동안 계속 보인다 — 닫기 버튼을 주면 영영 안 켠다.
 */
function PushBanner() {
  const { userId } = useSession()
  const [state, setState] = useState<PushState>(() => pushState())
  const [busy, setBusy] = useState(false)

  if (state === 'granted' || state === 'unsupported' || state === 'denied') return null

  if (state === 'ios-needs-install') {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-bg-subtle px-4 py-3">
        <Smartphone size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-muted" />
        <p className="text-xs text-fg-muted">
          <b className="text-fg">홈 화면에 추가</b>하면 업무 배정을 바로 알 수 있어요.
          <br />
          공유 버튼 → <b className="text-fg">홈 화면에 추가</b>를 눌러주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 flex items-center gap-3 rounded-md border border-border bg-bg-subtle px-4 py-3">
      <BellRing size={18} strokeWidth={1.75} className="shrink-0 text-primary" />
      <p className="flex-1 text-xs text-fg-muted">알림을 켜면 업무 배정을 바로 알 수 있어요</p>
      <Button
        variant="primary"
        className="px-3 py-1.5 text-xs"
        disabled={busy}
        onClick={async () => {
          if (!userId) return
          setBusy(true)
          // 실패를 'unsupported' 로 뭉개면 배너만 사라지고 아무 피드백이 없다 —
          // 구독 실패는 배너를 유지한 채 오류 토스트로 알린다
          const r = await enablePush(userId).catch((e: Error) => {
            toast.error(`알림을 켜지 못했어요: ${e.message}`)
            return null
          })
          setBusy(false)
          if (r === null) return
          setState(r)
          if (r === 'granted') toast.success('알림이 켜졌어요')
          if (r === 'denied') toast.error('브라우저 설정에서 알림 권한을 허용해야 해요')
        }}
      >
        알림 켜기
      </Button>
    </div>
  )
}

export function NotificationsPage() {
  const { data, isPending } = useNotifications()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const nav = useNavigate()

  if (isPending) return <Spinner />

  const list = data ?? []
  const hasUnread = list.some((n) => !n.read_at)

  function open(n: Notif) {
    if (!n.read_at) markRead.mutate(n.id)
    // 이미 처리된 알림이어도 오류를 내지 않는다 — Task 상세가 현재 상태를 보여준다 (User Flow §8-3)
    nav(notifDestination(n))
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">알림</h1>
        {hasUnread && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => markAll.mutate()}>
            모두 읽음
          </Button>
        )}
      </div>

      <PushBanner />

      {list.length === 0 ? (
        <EmptyState
          icon={<BellOff size={32} strokeWidth={1.5} />}
          title="새 알림이 없어요"
          achieved
        />
      ) : (
        <ul className="mt-4">
          {list.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => open(n)}
                className="flex w-full items-start gap-3 border-b border-border px-1 py-3 text-left transition-colors hover:bg-bg-subtle"
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-2 h-2 w-2 shrink-0 rounded-full',
                    n.read_at ? 'bg-border' : 'bg-primary',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-xs', !n.read_at && 'font-semibold')}>
                    {notifText(n)}
                  </span>
                  {n.task?.title && (
                    <span className="block truncate text-xs text-fg-muted">{n.task.title}</span>
                  )}
                  <span className="mt-0.5 block text-badge text-fg-subtle">
                    {n.project?.name && <>{n.project.name} · </>}
                    {relativeTime(n.created_at)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
