import { ChevronUp, ChevronDown, CalendarX } from 'lucide-react'
import type { EnrichedTask } from '@/lib/supabase'
import { StatusBadge, DelayedBadge } from '@/components/status'
import { Badge } from '@/components/ui'
import { dueLabel, dueShort, elapsedLabel } from '@/lib/date'
import { cn } from '@/lib/cn'

/**
 * 카드에 표시하는 것은 5개로 고정한다 (Wireframe §3).
 * 더 넣고 싶어지면 "이걸 보고 무슨 행동을 하나?" 를 먼저 묻는다.
 *
 * 배정 보드에서는 담당자 아바타를 표시하지 않는다 — 컬럼이 곧 담당자다.
 * 내 업무 보드에서는 프로젝트명을 표시한다 — 여러 프로젝트가 섞이기 때문.
 */
export function TaskCard({
  task,
  showProject,
  showStatus = true,
  dragging,
  className,
  ...props
}: {
  task: EnrichedTask
  showProject?: boolean
  showStatus?: boolean
  dragging?: boolean
  className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  const due = dueShort(task.due_date)
  const dLabel = dueLabel(task.due_date)
  const overdue = task.is_overdue ?? false
  const stale = task.is_stale ?? false
  const missingDue = task.is_missing_due ?? false

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-md border border-border bg-bg p-2.5',
        'cursor-pointer transition-colors hover:bg-bg-subtle',
        // 유일하게 shadow 가 허용되는 곳 — "들어올렸다"는 물리적 사실 (D-055)
        dragging && 'shadow-sm border-border-strong',
        className,
      )}
      {...props}
    >
      <p className="flex items-start gap-1 text-base leading-snug font-medium">
        {task.priority === 'high' && (
          <ChevronUp size={16} strokeWidth={2.25} className="mt-1 shrink-0 text-status-delayed" />
        )}
        {task.priority === 'low' && (
          <ChevronDown size={16} strokeWidth={2.25} className="mt-1 shrink-0 text-fg-subtle" />
        )}
        <span className="line-clamp-2">{task.title}</span>
      </p>

      {showProject && task.project_name && (
        <p className="truncate text-xs text-fg-subtle">{task.project_name}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {showStatus && task.status && <StatusBadge status={task.status} />}
        {(task.status === 'in_progress' || task.status === 'in_review') &&
          task.status_changed_at && (
            <span className="text-xs text-fg-muted">· {elapsedLabel(task.status_changed_at)}</span>
          )}
        {(stale || overdue) && <DelayedBadge />}
      </div>

      <div className="flex items-center gap-2">
        {missingDue ? (
          <span className="inline-flex items-center gap-1 text-xs text-status-delayed">
            <CalendarX size={14} strokeWidth={1.75} />
            마감일 없음
          </span>
        ) : (
          due && (
            <>
              <span className="text-xs text-fg-muted">{due}</span>
              {dLabel && (
                <Badge mono tone={overdue ? 'danger' : 'neutral'}>
                  {dLabel}
                </Badge>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}
