import { useNavigate } from 'react-router'
import { BellOff } from 'lucide-react'
import { Spinner, EmptyState, Button } from '@/components/ui'
import { relativeTime } from '@/lib/date'
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
