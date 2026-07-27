import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { dueQuickChips } from '@/lib/date'
import { cn } from '@/lib/cn'
import type { TaskPriority } from '@/lib/supabase'
import { UNASSIGNED, type BoardMember } from './use-board'

/**
 * 업무 생성 모달.
 *
 * ⚠️ US-301 AC-6(인라인 생성)을 대체한다.
 * 인라인이 노린 것은 "어느 컬럼에서 눌렀는지가 곧 담당자"라는 맥락이었다 (D-021b).
 * 그 맥락은 **담당자를 미리 채운 채로 여는 것**으로 그대로 지킨다.
 *
 * 대신 제목 말고도 마감일·우선순위·설명을 생성 시점에 받는다.
 * 인라인 입력창에서는 제목밖에 받을 수 없었고, 그 결과 마감일 없는 업무가
 * 계속 쌓였다 (10-UX-AUDIT §1-A · §5-1).
 */
export function CreateTaskDialog({
  members,
  defaultAssignee,
  canAssign,
  busy,
  onCreate,
  onClose,
}: {
  members: BoardMember[]
  /** 누른 컬럼 = 담당자. UNASSIGNED 면 미배정 */
  defaultAssignee: string
  /** 남에게 배정하려면 Lead 여야 한다 (tg_task_validate) */
  canAssign: boolean
  busy: boolean
  onCreate: (v: {
    title: string
    assigneeId: string | null
    due: string | null
    priority: TaskPriority
    description: string | null
  }) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState(defaultAssignee)
  const [due, setDue] = useState<string | null>(null)
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [description, setDescription] = useState('')
  const [customDue, setCustomDue] = useState(false)

  const chips = dueQuickChips()
  const assigned = assignee !== UNASSIGNED

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    onCreate({
      title: title.trim(),
      assigneeId: assigned ? assignee : null,
      due,
      priority,
      description: description.trim() || null,
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-60 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="fixed left-1/2 top-1/2 z-70 w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-bg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">새 업무</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <Input
            autoFocus
            value={title}
            maxLength={200}
            placeholder="무엇을 하나요?"
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">담당자</span>
              <select
                value={assignee}
                disabled={!canAssign}
                onChange={(e) => setAssignee(e.target.value)}
                className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs focus:border-primary focus:outline-none disabled:opacity-60"
              >
                <option value={UNASSIGNED}>미배정</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">우선순위</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              >
                <option value="low">낮음</option>
                <option value="normal">보통</option>
                <option value="high">높음</option>
              </select>
            </label>
          </div>

          <div>
            <span className="text-xs text-fg-muted">
              마감일
              {assigned && !due && <span className="ml-1 text-danger">담당자가 있으면 정해주세요</span>}
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    setDue(due === c.value ? null : c.value)
                    setCustomDue(false)
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    due === c.value
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-fg-muted hover:border-primary hover:text-primary',
                  )}
                >
                  {c.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomDue((v) => !v)}
                className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted hover:border-primary hover:text-primary"
              >
                직접 선택
              </button>
            </div>
            {customDue && (
              <input
                type="date"
                autoFocus
                value={due ?? ''}
                onChange={(e) => setDue(e.target.value || null)}
                className="mt-2 rounded-md border border-border bg-bg px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">설명 (선택)</span>
            <textarea
              rows={3}
              value={description}
              maxLength={5000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="맥락이 필요하면 적어주세요"
              className="resize-none rounded-md border border-border bg-bg px-2.5 py-2 text-xs placeholder:text-fg-subtle focus:border-primary focus:outline-none"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim() || busy}>
            만들기
          </Button>
        </div>
      </form>
    </>
  )
}
