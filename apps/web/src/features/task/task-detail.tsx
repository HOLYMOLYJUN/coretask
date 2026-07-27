import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { X, ArrowLeft, Check, CornerUpLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { useSession } from '@/features/auth/session'
import {
  useLeadProjectIds,
  useChangeStatus,
  useRejectTask,
  nextAction,
} from '@/features/my-tasks/use-my-tasks'
import { StatusBadge, DelayedBadge } from '@/components/status'
import { Spinner, Badge, Button } from '@/components/ui'
import { dueLabel, dueShort, elapsedLabel } from '@/lib/date'
import { TimelineSection } from './timeline'
import { useDeleteTask } from './use-delete'

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
  const { userId } = useSession()
  const nav = useNavigate()
  const { data: task, isPending } = useTask(taskId)
  const { data: leadIds } = useLeadProjectIds()
  const change = useChangeStatus()
  const reject = useRejectTask()
  const del = useDeleteTask()
  const [rejecting, setRejecting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (isPending) return <Spinner />
  if (!task) return <p className="p-4 text-xs text-fg-muted">업무를 찾을 수 없어요</p>

  const isLead = !!task.project_id && !!leadIds?.has(task.project_id)
  const isMine = task.assignee_id === userId
  const myAction = isMine && task.status ? nextAction(task.status) : null
  // US-302 AC-3: Lead. 본인이 만들었고 아직 미배정이면 만든 사람도
  const canDelete = isLead || (task.created_by === userId && !task.assignee_id)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{task.title}</h2>

      <div className="flex flex-wrap items-center gap-3">
        {task.status && <StatusBadge status={task.status} size="md" />}
        {(task.status === 'in_progress' || task.status === 'in_review') &&
          task.status_changed_at && (
            <span className="text-xs text-fg-muted">{elapsedLabel(task.status_changed_at)}</span>
          )}
        {(task.is_stale || task.is_overdue) && <DelayedBadge />}
        {task.due_date && (
          <>
            <span className="text-xs text-fg-muted">{dueShort(task.due_date)}</span>
            <Badge mono tone={task.is_overdue ? 'danger' : 'neutral'}>
              {dueLabel(task.due_date)}
            </Badge>
          </>
        )}
      </div>

      {/* ── 리뷰 처리 — Lead 에게만 렌더된다 (US-503).
             권한 없는 액션은 비활성 버튼조차 두지 않는다 (PRD §4) ── */}
      {isLead && task.status === 'in_review' && (
        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={change.isPending}
            onClick={() => change.mutate({ taskId, status: 'done' })}
          >
            <Check size={18} strokeWidth={2} />
            완료 확정
          </Button>
          <Button className="flex-1" onClick={() => setRejecting(true)}>
            <CornerUpLeft size={18} strokeWidth={1.75} />
            반려
          </Button>
        </div>
      )}

      {/* 담당자 본인의 다음 행동 하나 */}
      {myAction && task.status !== 'in_review' && (
        <Button
          variant="secondary"
          className="border-fg font-semibold"
          disabled={change.isPending}
          onClick={() => change.mutate({ taskId, status: myAction.to })}
        >
          {myAction.label}
        </Button>
      )}
      {isMine && !isLead && task.status === 'in_review' && (
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-center text-xs text-fg-muted">
          Lead 확인 대기중
        </p>
      )}

      <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-xs">
        <dt className="text-fg-muted">프로젝트</dt>
        <dd>{task.project_name}</dd>
        <dt className="text-fg-muted">시작일</dt>
        <dd>{task.start_date ?? '-'}</dd>
        <dt className="text-fg-muted">우선순위</dt>
        <dd>{task.priority === 'high' ? '높음' : task.priority === 'low' ? '낮음' : '보통'}</dd>
      </dl>

      {task.description && (
        <p className="border-t border-border pt-3 text-xs whitespace-pre-wrap">
          {task.description}
        </p>
      )}

      <TimelineSection taskId={taskId} projectId={task.project_id} canLead={isLead} />

      {canDelete && (
        <button
          onClick={() => setDeleting(true)}
          className="self-start border-t border-border pt-3 text-badge text-fg-subtle transition-colors hover:text-danger"
        >
          업무 삭제
        </button>
      )}

      {deleting && (
        <DeleteDialog
          title={task.title ?? ''}
          busy={del.isPending}
          onConfirm={() =>
            del.mutate(taskId, {
              onSuccess: () => {
                setDeleting(false)
                nav(-1)
              },
            })
          }
          onClose={() => setDeleting(false)}
        />
      )}

      {rejecting && (
        <RejectDialog
          busy={reject.isPending}
          onConfirm={(reason) => {
            reject.mutate(
              { taskId, reason },
              { onSuccess: () => setRejecting(false) },
            )
          }}
          onClose={() => setRejecting(false)}
        />
      )}
    </div>
  )
}

/** 삭제 확인 (US-302 AC-4). 확인 후에도 10초 Undo 토스트가 한 번 더 받쳐준다 */
function DeleteDialog({
  title,
  busy,
  onConfirm,
  onClose,
}: {
  title: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-60 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-70 w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-bg p-5">
        <h3 className="text-base font-semibold">업무를 삭제할까요?</h3>
        <p className="mt-2 text-xs text-fg-muted">
          <b className="text-fg">{title}</b>
          <br />
          댓글과 활동 기록도 함께 사라져요. 삭제 후 10초 안에 되돌릴 수 있어요.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            삭제
          </Button>
        </div>
      </div>
    </>
  )
}

/**
 * 반려 사유는 필수다 (US-503 AC-3).
 * 사유 없는 반려는 반드시 "왜 반려됐지?" 라는 카톡을 부른다 —
 * 입력 한 번의 비용으로 대화 하나를 도구 안에 붙잡아 두는 거래다.
 */
function RejectDialog({
  busy,
  onConfirm,
  onClose,
}: {
  busy: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')

  return (
    <>
      <div className="fixed inset-0 z-60 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-70 w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-bg p-5">
        <h3 className="text-base font-semibold">왜 되돌리나요?</h3>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-xs placeholder:text-fg-subtle focus:border-primary focus:outline-none"
          placeholder="예: 카카오 로그인이 빠져 있어요"
        />
        <p className="mt-1.5 text-badge text-fg-subtle">담당자에게 전달되고 댓글로 남습니다</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            disabled={!reason.trim() || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            반려하기
          </Button>
        </div>
      </div>
    </>
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
