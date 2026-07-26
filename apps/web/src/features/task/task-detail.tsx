import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { X, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { StatusBadge } from '@/components/status'
import { Spinner, Badge } from '@/components/ui'
import { dueLabel, dueShort, elapsedLabel } from '@/lib/date'

/**
 * D-031 — 하나의 주소, 두 가지 표현.
 * 패널(보드에서 클릭)과 전체 페이지(알림·직접 URL)가 같은 내용을 공유한다.
 */

function useTask(taskId: string) {
  return useQuery({
    queryKey: qk.task(taskId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_tasks_enriched')
        .select('*')
        .eq('id', taskId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

function Body({ taskId }: { taskId: string }) {
  const { data: task, isPending } = useTask(taskId)
  if (isPending) return <Spinner />
  if (!task) return <p className="p-4 text-xs text-fg-muted">업무를 찾을 수 없어요</p>

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{task.title}</h2>

      <div className="flex flex-wrap items-center gap-3">
        {task.status && <StatusBadge status={task.status} size="md" />}
        {(task.status === 'in_progress' || task.status === 'in_review') && task.status_changed_at && (
          <span className="text-xs text-fg-muted">{elapsedLabel(task.status_changed_at)}</span>
        )}
        {task.due_date && (
          <>
            <span className="text-xs text-fg-muted">{dueShort(task.due_date)}</span>
            <Badge mono tone={task.is_overdue ? 'danger' : 'neutral'}>
              {dueLabel(task.due_date)}
            </Badge>
          </>
        )}
      </div>

      <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-xs">
        <dt className="text-fg-muted">프로젝트</dt>
        <dd>{task.project_name}</dd>
        <dt className="text-fg-muted">시작일</dt>
        <dd>{task.start_date ?? '-'}</dd>
        <dt className="text-fg-muted">우선순위</dt>
        <dd>{task.priority === 'high' ? '높음' : task.priority === 'low' ? '낮음' : '보통'}</dd>
      </dl>

      {task.description && (
        <p className="border-t border-border pt-3 text-xs whitespace-pre-wrap">{task.description}</p>
      )}

      <p className="border-t border-border pt-3 text-xs text-fg-subtle">
        댓글과 활동 로그는 M3 에서 붙습니다 (US-602 · US-603)
      </p>
    </div>
  )
}

/** 패널 — 보드가 뒤에 그대로 보인다 */
export function TaskPanel() {
  const { taskId = '' } = useParams()
  const nav = useNavigate()
  const close = () => nav(-1)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(15,23,42,.32)]" onClick={close} />
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-border-strong bg-bg p-5"
        style={{ animation: 'panel-in .2s ease-out' }}
      >
        <div className="mb-4 flex justify-end">
          <button
            onClick={close}
            aria-label="닫기"
            className="rounded-full p-1.5 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <Body taskId={taskId} />
      </aside>
      <style>{`@keyframes panel-in{from{transform:translateX(16px);opacity:.6}to{transform:none;opacity:1}}`}</style>
    </>
  )
}

/** 전체 페이지 — 알림·직접 URL. 맥락 복귀 링크가 필수다 */
export function TaskPage() {
  const { taskId = '' } = useParams()
  const { data: task } = useTask(taskId)
  const nav = useNavigate()

  return (
    <div className="px-4 py-6 md:px-6">
      <button
        onClick={() => (task ? nav(`/projects/${task.project_id}/board`) : nav('/tasks'))}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
        {task?.project_name ? `${task.project_name} 보드로` : '내 업무로'}
      </button>
      <div className="max-w-2xl">
        <Body taskId={taskId} />
      </div>
    </div>
  )
}
