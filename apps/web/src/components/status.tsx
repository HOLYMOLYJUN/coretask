import { cn } from '@/lib/cn'
import type { TaskStatus } from '@/lib/supabase'

/**
 * 상태 표현 — 아이콘이 아니라 뮤트 톤 원형이다 (D-051).
 * 색만으로는 색각 이상이 있는 사람이 구분할 수 없으므로
 * StatusDot 을 단독으로 두지 않고 항상 라벨과 함께 쓴다.
 */

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: '예정',
  in_progress: '진행중',
  in_review: '리뷰중',
  done: '완료',
}

const DOT: Record<TaskStatus, string> = {
  todo: 'bg-status-todo',
  in_progress: 'bg-status-progress',
  in_review: 'bg-status-review',
  done: 'bg-status-done',
}

type DotSize = 'sm' | 'md'

export function StatusDot({
  status,
  size = 'md',
  className,
}: {
  status: TaskStatus
  size?: DotSize
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'shrink-0 rounded-full',
        size === 'md' ? 'w-6 h-6' : 'w-3 h-3',
        DOT[status],
        className,
      )}
    />
  )
}

/** 원형 + 라벨. 기본 조합이다. */
export function StatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: TaskStatus
  size?: DotSize
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs text-fg-muted', className)}>
      <StatusDot status={status} size={size} />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** 지연 — 유일한 경고색. 정보가 아니라 경고이므로 나머지보다 채도가 높다 */
export function DelayedBadge({ label = '지연' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-status-delayed">
      <span aria-hidden className="w-3 h-3 shrink-0 rounded-full bg-status-delayed" />
      {label}
    </span>
  )
}
