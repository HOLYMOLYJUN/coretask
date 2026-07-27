import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { X, ArrowLeft, Check, CornerUpLeft, CalendarDays } from 'lucide-react'
import { supabase, type TaskPriority } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { cn } from '@/lib/cn'
import { useSession } from '@/features/auth/session'
import { useProjectMembers } from '@/features/board/use-board'
import { DuePopover } from '@/features/board/due-popover'
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
import { useUpdateTask } from './use-update-task'
import { EditableText, EditableSelect } from './editable'

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
  const update = useUpdateTask(taskId)
  const [rejecting, setRejecting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [duePicker, setDuePicker] = useState<{ x: number; y: number } | null>(null)
  const { data: members = [] } = useProjectMembers(task?.project_id ?? '')

  if (isPending) return <Spinner />
  if (!task) return <p className="p-4 text-xs text-fg-muted">업무를 찾을 수 없어요</p>

  const isLead = !!task.project_id && !!leadIds?.has(task.project_id)
  const isMine = task.assignee_id === userId
  const myAction = isMine && task.status ? nextAction(task.status) : null
  // US-302 AC-3: Lead. 본인이 만들었고 아직 미배정이면 만든 사람도
  const canDelete = isLead || (task.created_by === userId && !task.assignee_id)
  /**
   * 편집 권한 (US-601 AC-3).
   * 담당자 본인과 Lead. 완료된 업무는 기록이므로 건드리지 않는다 —
   * 완료 뒤 마감일을 고치면 "기한 내/지연" 판정이 사후에 바뀐다.
   */
  const canEdit = (isLead || isMine) && task.status !== 'done'
  const canAssign = isLead // 남에게 배정하는 것은 Lead 권한 (tg_task_validate)

  return (
    <div className="flex flex-col gap-4">
      <EditableText
        value={task.title ?? ''}
        editable={canEdit}
        maxLength={200}
        className="text-lg font-semibold"
        onSave={(title) => update.mutate({ title })}
      />

      <div className="flex flex-wrap items-center gap-3">
        {task.status && <StatusBadge status={task.status} size="md" />}
        {(task.status === 'in_progress' || task.status === 'in_review') &&
          task.status_changed_at && (
            <span className="text-xs text-fg-muted">{elapsedLabel(task.status_changed_at)}</span>
          )}
        {(task.is_stale || task.is_overdue) && <DelayedBadge />}

        {/* 마감일 — 없을 때도 자리를 남긴다. 여기가 §1-A 의 막다른 길이었다 */}
        <button
          type="button"
          disabled={!canEdit}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setDuePicker({ x: r.left, y: r.bottom + 6 })
          }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors',
            canEdit && 'hover:bg-bg-subtle',
            task.due_date ? 'text-fg-muted' : 'text-danger',
          )}
        >
          <CalendarDays size={14} strokeWidth={1.75} />
          {task.due_date ? dueShort(task.due_date) : '마감일 없음'}
        </button>
        {task.due_date && (
          <Badge mono tone={task.is_overdue ? 'danger' : 'neutral'}>
            {dueLabel(task.due_date)}
          </Badge>
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

      <dl className="grid grid-cols-[80px_1fr] items-center gap-y-1 text-xs">
        <dt className="text-fg-muted">프로젝트</dt>
        <dd>{task.project_name}</dd>

        <dt className="text-fg-muted">담당자</dt>
        <dd>
          <EditableSelect
            value={task.assignee_id ?? ''}
            editable={canAssign}
            className="text-xs"
            options={[
              { value: '', label: '미배정' },
              ...members.map((m) => ({ value: m.user_id, label: m.name })),
            ]}
            onSave={(id) => update.mutate({ assignee_id: id || null })}
          />
        </dd>

        <dt className="text-fg-muted">우선순위</dt>
        <dd>
          <EditableSelect
            value={(task.priority ?? 'normal') as TaskPriority}
            editable={canEdit}
            className="text-xs"
            options={[
              { value: 'low', label: '낮음' },
              { value: 'normal', label: '보통' },
              { value: 'high', label: '높음' },
            ]}
            onSave={(priority) => update.mutate({ priority })}
          />
        </dd>

        <dt className="text-fg-muted">시작일</dt>
        <dd className="px-1.5">{task.start_date ?? '-'}</dd>
      </dl>

      {/* 설명 — 비어 있어도 자리를 남긴다. 없으면 추가할 곳이 없어진다 */}
      {(canEdit || task.description) && (
        <div className="border-t border-border pt-3">
          <EditableText
            value={task.description ?? ''}
            editable={canEdit}
            multiline
            maxLength={5000}
            placeholder="설명 추가"
            className="text-xs"
            onSave={(description) => update.mutate({ description: description || null })}
          />
        </div>
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

      {duePicker && (
        <DuePopover
          x={duePicker.x}
          y={duePicker.y}
          onPick={(due) => {
            update.mutate({ due_date: due })
            setDuePicker(null)
          }}
          onSkip={() => setDuePicker(null)}
        />
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
