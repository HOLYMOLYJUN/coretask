import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation, Link } from 'react-router'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Info, CheckCheck, Users, FileText, ChevronRight } from 'lucide-react'
import type { EnrichedTask } from '@/lib/supabase'
import { useSession } from '@/features/auth/session'
import { useLeadProjectIds } from '@/features/my-tasks/use-my-tasks'
import {
  useBoard,
  useRecentDone,
  useMoveTask,
  useClaimTask,
  useCreateTask,
  DONE_WINDOW_DAYS,
  UNASSIGNED,
} from './use-board'
import { TaskCard } from './task-card'
import { DuePopover } from './due-popover'
import { MembersDialog } from './members-dialog'
import { CreateTaskDialog } from './create-task-dialog'
import { Spinner, Button } from '@/components/ui'
import { cn } from '@/lib/cn'

type Filter = 'all' | 'in_progress' | 'review' | 'delayed'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'in_progress', label: '진행중' },
  { key: 'review', label: '리뷰 대기' },
  { key: 'delayed', label: '지연' },
]

const colOf = (t: EnrichedTask) => t.assignee_id ?? UNASSIGNED

/** ⭐ 제품의 심장 (US-401). 컬럼은 사람, 상태는 카드에 있다 */
export function BoardPage() {
  const { projectId = '' } = useParams()
  const { userId } = useSession()
  const nav = useNavigate()
  const loc = useLocation()
  const [sp, setSp] = useSearchParams()

  const { members, tasks } = useBoard(projectId)
  const recentDone = useRecentDone(projectId)
  const move = useMoveTask(projectId)
  const claim = useClaimTask(projectId)
  const create = useCreateTask(projectId)

  const [managingMembers, setManagingMembers] = useState(false)
  /** 값 = 누른 컬럼 id (담당자). null 이면 닫힘 */
  const [creating, setCreating] = useState<string | null>(null)
  const [dragging, setDragging] = useState<EnrichedTask | null>(null)
  /**
   * 드래그 중의 미리보기 순서.
   * 서버 캐시를 직접 흔들지 않고 복사본을 움직인다 — 드롭이 확정될 때만 mutation 이 나간다.
   * 이 복사본 덕에 카드가 목적지 슬롯에 "이미 놓인 채로" 렌더되므로,
   * 자리를 비켜주는 이동과 드롭 안착이 전부 올바른 방향으로 애니메이션된다.
   */
  const [draft, setDraft] = useState<EnrichedTask[] | null>(null)
  const [pending, setPending] = useState<{
    task: EnrichedTask
    assigneeId: string | null
    beforeId: string | null
    afterId: string | null
    x: number
    y: number
    claiming: boolean
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // PRD §7 — 드래그로만 가능한 동작이 없어야 한다
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const filter = (FILTERS.find((f) => f.key === sp.get('filter'))?.key ?? 'all') as Filter
  /**
   * Lead 판정의 기준은 **서버의 `is_project_lead()` 하나뿐이다** (Foundation §9).
   * `project_members.role = 'lead'` 만 보면 프로젝트에 속하지 않은 워크스페이스
   * Admin/Owner 를 놓친다 — 그 사람은 서버에서 배정·완료확정·삭제가 전부 통과하는데
   * UI 만 드래그를 막고 "배정은 Lead가 합니다" 안내를 띄웠다 (10-UX-AUDIT §7).
   * `v_my_lead_projects` 가 그 분기를 이미 흡수하고 있으므로 그것만 본다 (D-038).
   */
  const leadProjects = useLeadProjectIds()
  const isLead = !!leadProjects.data?.has(projectId)

  const counts = useMemo(() => {
    const t = tasks.data ?? []
    return {
      all: t.length,
      in_progress: t.filter((x) => x.status === 'in_progress').length,
      review: t.filter((x) => x.status === 'in_review').length,
      delayed: t.filter((x) => x.is_stale || x.is_overdue).length,
    }
  }, [tasks.data])

  // 필터는 재조회하지 않는다 — 이미 받은 배열을 거른다 (API §2.1)
  const visible = useMemo(() => {
    const t = tasks.data ?? []
    if (filter === 'in_progress') return t.filter((x) => x.status === 'in_progress')
    if (filter === 'review') return t.filter((x) => x.status === 'in_review')
    if (filter === 'delayed') return t.filter((x) => x.is_stale || x.is_overdue)
    return t
  }, [tasks.data, filter])

  // 드래그 중에는 draft 가, 평소에는 서버 데이터가 진실이다
  const list = draft ?? visible

  const columns = useMemo(() => {
    const cols = [{ id: UNASSIGNED, name: '미배정', isMe: false }]
    for (const m of members.data ?? []) {
      cols.push({ id: m.user_id, name: m.name, isMe: m.user_id === userId })
    }
    // 본인 컬럼을 미배정 바로 다음에 고정 (Wireframe §10-3)
    const meIdx = cols.findIndex((c) => c.isMe)
    if (meIdx > 1) cols.splice(1, 0, cols.splice(meIdx, 1)[0])
    return cols
  }, [members.data, userId])

  /** 팀원이 이 카드를 잡을 수 있나 — 미배정(가져가기·정렬) 또는 본인 것(정렬) */
  function canDragTask(t: EnrichedTask) {
    return isLead || !t.assignee_id || t.assignee_id === userId
  }

  /** 팀원이 이 이동을 해도 되나 — UI 선에서 거른다. 최종 판정은 DB 트리거 */
  function memberAllowed(fromCol: string, toCol: string) {
    if (isLead) return true
    if (fromCol === toCol) return fromCol === UNASSIGNED || fromCol === userId // 정렬
    return fromCol === UNASSIGNED && toCol === userId // 가져가기
  }

  function onDragStart(e: DragStartEvent) {
    const t = (tasks.data ?? []).find((x) => x.id === e.active.id) ?? null
    setDragging(t)
    setDraft(visible.slice())
  }

  /** 컬럼을 넘어가는 순간 draft 에서 카드를 옮긴다 → 목적지 컬럼이 자리를 비켜준다 */
  function onDragOver(e: DragOverEvent) {
    const over = e.over
    if (!over || !draft) return
    const activeId = String(e.active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const a = draft.find((t) => t.id === activeId)
    if (!a) return
    const overTask = draft.find((t) => t.id === overId)
    const fromCol = colOf(a)
    const toCol = overTask ? colOf(overTask) : overId
    if (fromCol === toCol) return // 같은 컬럼 내 이동은 SortableContext 가 시각 처리한다
    if (!memberAllowed(fromCol, toCol)) return

    setDraft((prev) => {
      if (!prev) return prev
      const moved = {
        ...prev.find((t) => t.id === activeId)!,
        assignee_id: toCol === UNASSIGNED ? null : toCol,
      }
      const without = prev.filter((t) => t.id !== activeId)
      if (overTask) {
        const idx = without.findIndex((t) => t.id === overId)
        without.splice(idx, 0, moved)
      } else {
        without.push(moved) // 빈 영역 → 맨 아래
      }
      return without
    })
  }

  function onDragEnd(e: DragEndEvent) {
    const task = dragging
    setDragging(null)
    const d = draft

    const bail = () => setDraft(null)
    if (!task || !e.over || !d) return bail()

    const overId = String(e.over.id)
    const overTask = d.find((t) => t.id === overId)
    const current = d.find((t) => t.id === task.id)
    if (!current) return bail()

    const targetCol = overTask ? colOf(overTask) : overId
    const fromColOriginal = colOf(task) // 드래그 시작 시점 기준
    if (!memberAllowed(fromColOriginal, targetCol)) return bail()

    const assigneeId = targetCol === UNASSIGNED ? null : targetCol

    // 목적지 컬럼에서의 최종 순서 → 이웃(before/after) 계산
    const items = d.filter((t) => colOf(t) === targetCol)
    const oldIndex = items.findIndex((t) => t.id === task.id)
    if (oldIndex === -1) return bail()

    let newIndex = oldIndex
    if (overTask && overTask.id !== task.id) {
      newIndex = items.findIndex((t) => t.id === overId)
    } else if (!overTask) {
      newIndex = items.length - 1
    }
    const reordered = arrayMove(items, oldIndex, newIndex)
    const i = reordered.findIndex((t) => t.id === task.id)
    const beforeId = reordered[i - 1]?.id ?? null
    const afterId = reordered[i + 1]?.id ?? null

    const assigneeChanged = (task.assignee_id ?? null) !== assigneeId
    const orderChanged = oldIndex !== newIndex || assigneeChanged
    if (!orderChanged) return bail()

    const claiming = !isLead && assigneeChanged

    // 마감일이 없으면 팝오버 — draft 를 유지해 카드가 목적지에 놓인 채로 묻는다 (D-021b)
    if (assigneeId !== null && assigneeChanged && !task.due_date) {
      const rect = e.active.rect.current.translated
      setPending({
        task,
        assigneeId,
        beforeId,
        afterId,
        x: rect?.left ?? window.innerWidth / 2,
        y: (rect?.bottom ?? window.innerHeight / 2) + 8,
        claiming,
      })
      return
    }

    if (claiming) claim.mutate({ taskId: task.id!, due: task.due_date! })
    else move.mutate({ taskId: task.id!, assigneeId, beforeId, afterId })
    setDraft(null)
  }

  function openTask(taskId: string) {
    // D-031 — 보드에서 왔다는 사실을 state 로 실어 보낸다 → 패널로 열린다
    nav(`/tasks/${taskId}`, { state: { backgroundLocation: loc } })
  }

  // leadProjects 도 기다린다 — 이게 늦으면 Lead 에게 "배정은 Lead가 합니다" 가 깜빡이고
  // 그 사이 드래그가 잠긴다
  if (members.isPending || tasks.isPending || leadProjects.isPending) return <Spinner />

  const boardEmpty = (tasks.data?.length ?? 0) === 0

  return (
    <div className="flex flex-col">
      {/* 필터 칩 — Lead 의 질문을 그 자리에서 답한다 (US-404) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 md:px-6">
        {FILTERS.map((f) => {
          const n = counts[f.key]
          const on = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setSp(f.key === 'all' ? {} : { filter: f.key }, { replace: true })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                on
                  ? 'border-primary bg-primary text-white'
                  : 'border-border text-fg-muted hover:border-border-strong',
                !n && !on && 'opacity-50',
              )}
            >
              {f.label} <span className="num">{n}</span>
            </button>
          )
        })}

        <div className="ml-auto flex items-center gap-3">
          {/* 이 프로젝트가 뭐고 어디까지 왔나 — 보드가 답하지 않는 질문 (US-203) */}
          <Link
            to={`/projects/${projectId}`}
            className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            <Info size={14} strokeWidth={1.75} />
            개요
          </Link>
          {/* 컬럼이 곧 사람이다 — 사람을 더하는 입구가 보드에 있어야 한다 (US-202) */}
          <button
            onClick={() => setManagingMembers(true)}
            className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            <Users size={14} strokeWidth={1.75} />
            멤버 <span className="num">{members.data?.length ?? 0}</span>
          </button>
          {/* 문서는 프로젝트 안에만 있다 (D-013) */}
          <Link
            to={`/projects/${projectId}/docs`}
            className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            <FileText size={14} strokeWidth={1.75} />
            문서
          </Link>
          {/* 완료는 보드에 없다 (D-005) — 끝난 일은 표로 따로 본다 */}
          <Link
            to={`/projects/${projectId}/done`}
            className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            <CheckCheck size={14} strokeWidth={1.75} />
            완료된 업무
          </Link>
        </div>
      </div>

      {creating !== null && (
        <CreateTaskDialog
          members={members.data ?? []}
          defaultAssignee={creating}
          canAssign={isLead}
          busy={create.isPending}
          onCreate={(v) =>
            create.mutate(
              {
                title: v.title,
                assigneeId: v.assigneeId,
                createdBy: userId!,
                due: v.due,
                priority: v.priority,
                description: v.description,
              },
              { onSuccess: () => setCreating(null) },
            )
          }
          onClose={() => setCreating(null)}
        />
      )}

      {managingMembers && (
        <MembersDialog
          projectId={projectId}
          canManage={isLead}
          onClose={() => setManagingMembers(false)}
        />
      )}

      {!isLead && (
        <p className="hidden items-center gap-2 border-b border-border bg-bg-subtle px-4 py-2 text-xs text-fg-muted md:flex md:px-6">
          <Info size={14} strokeWidth={1.75} />
          배정은 Lead가 합니다. 미배정 업무는 직접 가져갈 수 있어요
        </p>
      )}

      {/* ── 모바일: 읽기 전용 (IA §6 · D-026) ────────────────────
          배정 보드는 데스크톱 전용이다. 폰에서 사람 컬럼을 가로 스크롤시키면
          카드 하나를 보려고 두 번 스크롤해야 하고, 드래그는 탭과 구분되지 않는다.
          그래도 **조회는 필요하다** — `더보기` 에서 여기로 들어온다. */}
      <div className="md:hidden">
        <p className="flex items-center gap-2 border-b border-border bg-bg-subtle px-4 py-2 text-xs text-fg-muted">
          <Info size={14} strokeWidth={1.75} />
          배정은 PC에서 해주세요. 여기서는 보기만 할 수 있어요
        </p>

        <div className="flex flex-col gap-5 px-4 py-4">
          {columns.map((col) => {
            const items = visible.filter((t) => colOf(t) === col.id)
            return (
              <section key={col.id}>
                <div
                  className={cn(
                    'mb-2 flex items-baseline justify-between border-b pb-1.5',
                    col.isMe ? 'border-fg' : 'border-border-strong',
                  )}
                >
                  <span className="text-base font-semibold">
                    {col.name}
                    {col.isMe && <span className="ml-1 text-fg-subtle">(나)</span>}
                  </span>
                  <span className="num text-xs text-fg-muted">{items.length}</span>
                </div>

                {items.length ? (
                  <div className="flex flex-col gap-2">
                    {items.map((t) => (
                      <TaskCard key={t.id} task={t} onClick={() => openTask(t.id!)} />
                    ))}
                  </div>
                ) : (
                  <p className="px-1 py-2 text-xs text-fg-subtle">비어 있어요</p>
                )}
              </section>
            )
          })}
        </div>
      </div>

      {/* Task 가 0개여도 컬럼을 그린다 — 첫 업무를 만들 곳이 있어야 한다 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null)
          setDraft(null)
        }}
      >
        <div className="hidden gap-3 overflow-x-auto px-4 py-4 md:flex md:px-6">
          {columns.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              name={col.name}
              highlight={col.isMe}
              boardEmpty={boardEmpty}
              tasks={list.filter((t) => colOf(t) === col.id)}
              done={(recentDone.data ?? []).filter((t) => colOf(t) === col.id)}
              canDragTask={canDragTask}
              onOpen={openTask}
              onCreate={() => setCreating(col.id)}
            />
          ))}
        </div>

        {/* draft 가 카드를 목적지 슬롯에 이미 놓아두므로,
            기본 dropAnimation 이 오버레이를 "그 슬롯"으로 정확히 날린다.
            (draft 도입 전에는 출발지로 되돌아가는 오측정이 있어 껐었다) */}
        <DragOverlay>
          {dragging && <TaskCard task={dragging} dragging className="w-64" />}
        </DragOverlay>
      </DndContext>

      {pending && (
        <DuePopover
          x={pending.x}
          y={pending.y}
          allowSkip={!pending.claiming}
          onPick={(due) => {
            if (pending.claiming) claim.mutate({ taskId: pending.task.id!, due })
            else
              move.mutate({
                taskId: pending.task.id!,
                assigneeId: pending.assigneeId,
                beforeId: pending.beforeId,
                afterId: pending.afterId,
                due,
              })
            setPending(null)
            setDraft(null)
          }}
          onSkip={() => {
            if (!pending.claiming) {
              move.mutate({
                taskId: pending.task.id!,
                assigneeId: pending.assigneeId,
                beforeId: pending.beforeId,
                afterId: pending.afterId,
              })
            }
            // 가져가기 취소면 mutation 없이 draft 만 버린다 → 카드가 제자리로
            setPending(null)
            setDraft(null)
          }}
        />
      )}
    </div>
  )
}

function Column({
  id,
  name,
  tasks,
  done,
  canDragTask,
  highlight,
  boardEmpty,
  onOpen,
  onCreate,
}: {
  id: string
  name: string
  tasks: EnrichedTask[]
  /** 최근 완료 — 기본적으로 접혀 있다 (US-405 AC-1) */
  done: EnrichedTask[]
  canDragTask: (t: EnrichedTask) => boolean
  highlight?: boolean
  boardEmpty?: boolean
  onOpen: (id: string) => void
  onCreate: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const [showDone, setShowDone] = useState(false)

  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div
        className={cn(
          'mb-2 flex items-baseline justify-between border-b pb-2',
          highlight ? 'border-fg' : 'border-border-strong',
        )}
      >
        <span className="text-base font-semibold">{name}</span>
        <span className="num text-xs text-fg-muted">{tasks.length}</span>
      </div>

      <SortableContext items={tasks.map((t) => t.id!)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-24 flex-col gap-2 rounded-md p-1 transition-colors',
            isOver && 'bg-primary-subtle ring-1 ring-primary',
          )}
        >
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} canDrag={canDragTask(t)} onOpen={onOpen} />
          ))}

          {tasks.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-fg-subtle">
              {boardEmpty && id === UNASSIGNED
                ? '아직 업무가 없어요'
                : id === UNASSIGNED
                  ? '미배정 업무가 없어요'
                  : '여기로 카드를 끌어다 놓으세요'}
            </p>
          )}
        </div>
      </SortableContext>

      {/* 완료는 접어 둔다 (US-405 AC-1). 컬럼의 주인공은 아직 안 끝난 일이다 */}
      {done.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
          >
            <ChevronRight
              size={14}
              strokeWidth={2}
              className={cn('shrink-0 transition-transform', showDone && 'rotate-90')}
            />
            완료 <span className="num">{done.length}</span>건 {showDone ? '숨기기' : '보기'}
          </button>

          {showDone && (
            <div className="mt-1 flex flex-col gap-2 opacity-60">
              {done.map((t) => (
                // 완료 카드는 끌 수 없다 — 되돌리기는 상세에서 Lead 가 한다 (D-007)
                <TaskCard key={t.id} task={t} onClick={() => onOpen(t.id!)} />
              ))}
              {/* 링크는 상단 `완료된 업무` 하나로 충분하다 — 컬럼마다 반복하지 않는다 */}
              <p className="px-1 text-center text-badge text-fg-subtle">
                {DONE_WINDOW_DAYS}일이 지난 완료는 위 `완료된 업무` 에 있어요
              </p>
            </div>
          )}
        </div>
      )}

      {/* 생성은 모달이다 — 제목만 받으면 마감일 없는 업무가 계속 쌓인다 (10-UX-AUDIT §5-1) */}
      <Button
        variant="ghost"
        className="mt-2 justify-start px-2.5 py-2 text-xs"
        onClick={onCreate}
      >
        <Plus size={16} strokeWidth={1.75} />
        업무 추가
      </Button>
    </div>
  )
}

function SortableCard({
  task,
  canDrag,
  onOpen,
}: {
  task: EnrichedTask
  canDrag: boolean
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id!,
    disabled: !canDrag,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
    >
      <TaskCard
        task={task}
        className={isDragging ? 'opacity-40' : undefined}
        onClick={() => onOpen(task.id!)}
      />
    </div>
  )
}
