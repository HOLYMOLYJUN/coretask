import { useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Lock, LayoutGrid, List } from 'lucide-react'
import { toast } from 'sonner'
import type { EnrichedTask, TaskStatus } from '@/lib/supabase'
import { MESSAGE } from '@/lib/errors'
import { TaskCard } from '@/features/board/task-card'
import { STATUS_LABEL } from '@/components/status'
import { Spinner, EmptyState, Button } from '@/components/ui'
import { useMyTasks, useLeadProjectIds, useChangeStatus, nextAction } from './use-my-tasks'
import { TaskListView } from './list-view'
import { cn } from '@/lib/cn'

const COLS: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']

/**
 * US-501 · US-502 · US-505
 * 배정 보드와 같은 Task.status 를 공유한다 — 화면은 둘, 진실은 하나 (D-005).
 * 여기서 드래그의 의미는 담당자가 아니라 상태다.
 */
export function MyTasksPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const [sp, setSp] = useSearchParams()
  const { data, isPending } = useMyTasks()
  const { data: leadIds } = useLeadProjectIds()
  const change = useChangeStatus()

  const [dragging, setDragging] = useState<EnrichedTask | null>(null)
  const [mobileTab, setMobileTab] = useState<TaskStatus>('todo')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  // 리스트 뷰는 내 것으로 좁히지 않는다 — 보드 데이터를 기다릴 이유가 없다 (US-504)
  const view = sp.get('view') === 'list' ? 'list' : 'board'

  /** 뷰만 바꾸고 나머지 파라미터(필터·정렬)는 건드리지 않는다 */
  function setView(next: 'board' | 'list') {
    const p = new URLSearchParams(sp)
    if (next === 'list') p.set('view', 'list')
    else p.delete('view')
    setSp(p, { replace: true })
  }

  if (view === 'list') {
    return (
      <div className="px-4 py-6 md:px-6">
        <Header view={view} onView={setView} />
        <TaskListView />
      </div>
    )
  }

  if (isPending) return <Spinner />

  const tasks = data ?? []
  const openPanel = (id: string) => nav(`/tasks/${id}`, { state: { backgroundLocation: loc } })
  const openPage = (id: string) => nav(`/tasks/${id}`) // 모바일은 전체 페이지 (D-031)

  /** 이 카드를 완료 확정할 수 있나 — 그 프로젝트의 Lead 인가 (D-016c) */
  const canFinish = (t: EnrichedTask) => !!t.project_id && !!leadIds?.has(t.project_id)

  function onDragEnd(e: DragEndEvent) {
    const task = dragging
    setDragging(null)
    if (!task || !e.over) return

    const to = String(e.over.id) as TaskStatus
    if (!COLS.includes(to) || to === task.status) return

    // 완료 컬럼 — Lead 인 프로젝트의 카드만 (US-501 AC-5)
    if (to === 'done' && !canFinish(task)) {
      toast.error(MESSAGE.FORBIDDEN_DONE)
      return
    }
    // 시작 안 한 업무는 리뷰로 못 간다 — DB도 막지만 왕복 없이 바로 말해준다
    if (task.status === 'todo' && to === 'in_review') {
      toast.error('시작하지 않은 업무는 리뷰할 수 없어요. 먼저 시작해주세요')
      return
    }

    change.mutate({ taskId: task.id!, status: to })
  }

  if (!tasks.length) {
    return (
      <div className="px-4 py-6 md:px-6">
        <Header view={view} onView={setView} />
        <EmptyState
          title="아직 배정된 업무가 없어요"
          description="프로젝트 보드에서 업무를 가져오거나, 리스트에서 팀 업무를 볼 수 있어요"
        />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <Header view={view} onView={setView} />

      {/* ── 데스크톱: 상태 컬럼 드래그 ─────────────────────── */}
      <div className="mt-4 hidden md:block">
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="flex gap-3 overflow-x-auto">
            {COLS.map((status) => (
              <StatusColumn
                key={status}
                status={status}
                tasks={tasks.filter((t) => t.status === status)}
                lockedFor={(t) => status === 'done' && !canFinish(t)}
                draggingStatus={dragging?.status ?? null}
                draggingFinishable={dragging ? canFinish(dragging) : false}
                onOpen={openPanel}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging && (
              <TaskCard task={dragging} showProject showStatus={false} dragging className="w-64" />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* ── 모바일: 상태 탭 + 리스트 + 액션 버튼 (US-505) ───── */}
      <div className="mt-4 md:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {COLS.map((s) => {
            const n = tasks.filter((t) => t.status === s).length
            const on = mobileTab === s
            return (
              <button
                key={s}
                onClick={() => setMobileTab(s)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition-colors',
                  on ? 'border-fg bg-fg font-semibold text-bg' : 'border-border text-fg-muted',
                )}
              >
                {STATUS_LABEL[s]} <span className="num">{n}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {tasks
            .filter((t) => t.status === mobileTab)
            .map((t) => {
              const act = nextAction(mobileTab)
              return (
                <div key={t.id} className="rounded-md border border-border bg-bg p-2.5">
                  <TaskCard
                    task={t}
                    showProject
                    showStatus={false}
                    className="border-0 p-0 hover:bg-transparent"
                    onClick={() => openPage(t.id!)}
                  />
                  {/* 버튼은 하나만 — 폰에서 선택지가 여럿이면 오탭이 난다 (F2-B) */}
                  {act && (
                    <Button
                      variant="secondary"
                      className="mt-2 w-full border-fg py-1.5 text-xs font-semibold"
                      disabled={change.isPending}
                      onClick={() => change.mutate({ taskId: t.id!, status: act.to })}
                    >
                      {act.label}
                    </Button>
                  )}
                  {mobileTab === 'in_review' && (
                    <p className="mt-2 text-center text-badge text-fg-subtle">
                      Lead 확인 대기중
                    </p>
                  )}
                </div>
              )
            })}
          {tasks.filter((t) => t.status === mobileTab).length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-fg-subtle">
              비어 있어요
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 뷰 전환 (US-504 AC-1).
 * 보드가 기본이다 — `내 업무` 로 들어온 사람의 첫 질문은 "내가 뭘 하지" 지
 * "팀이 뭘 하지" 가 아니다. 리스트는 그다음 질문의 자리다.
 */
function Header({
  view,
  onView,
}: {
  view: 'board' | 'list'
  onView: (v: 'board' | 'list') => void
}) {
  const tab = (v: 'board' | 'list', icon: React.ReactNode, label: string) => (
    <button
      onClick={() => onView(v)}
      aria-pressed={view === v}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
        view === v ? 'bg-bg font-semibold text-fg' : 'text-fg-muted hover:text-fg',
      )}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-3">
      <h1 className="text-xl font-semibold">내 업무</h1>
      <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border bg-bg-subtle p-0.5">
        {tab('board', <LayoutGrid size={14} strokeWidth={1.75} />, '보드')}
        {tab('list', <List size={14} strokeWidth={1.75} />, '리스트')}
      </div>
    </div>
  )
}

function StatusColumn({
  status,
  tasks,
  lockedFor,
  draggingStatus,
  draggingFinishable,
  onOpen,
}: {
  status: TaskStatus
  tasks: EnrichedTask[]
  lockedFor: (t: EnrichedTask) => boolean
  draggingStatus: TaskStatus | null
  draggingFinishable: boolean
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  // 드래그 중 이 컬럼이 유효한 목적지인지 — 잠긴 곳은 강조하지 않는다
  const isValidTarget =
    draggingStatus !== null &&
    draggingStatus !== status &&
    !(status === 'done' && !draggingFinishable) &&
    !(draggingStatus === 'todo' && status === 'in_review')

  const isDoneLocked = status === 'done' && !draggingFinishable && draggingStatus !== null

  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="mb-2 flex items-baseline justify-between border-b border-border-strong pb-2">
        <span className="text-base font-semibold">{STATUS_LABEL[status]}</span>
        <span className="num text-xs text-fg-muted">{tasks.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-col gap-2 rounded-md p-1 transition-colors',
          isOver && isValidTarget && 'bg-primary-subtle ring-1 ring-primary',
          isOver && isDoneLocked && 'bg-bg-sunken ring-1 ring-border-strong',
        )}
      >
        {tasks.map((t) => (
          <DraggableStatusCard key={t.id} task={t} onOpen={onOpen} locked={lockedFor(t)} />
        ))}

        {tasks.length === 0 &&
          (status === 'done' ? (
            <div className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-8 text-center">
              <Lock size={18} strokeWidth={1.75} className="mx-auto text-fg-subtle" />
              <p className="mt-2 text-xs text-fg-muted">Lead가 확정합니다</p>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-fg-subtle">
              비어 있어요
            </p>
          ))}
      </div>
    </div>
  )
}

function DraggableStatusCard({
  task,
  locked,
  onOpen,
}: {
  task: EnrichedTask
  locked: boolean
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id!,
    disabled: locked,
  })

  return (
    <div ref={setNodeRef} {...(!locked ? { ...listeners, ...attributes } : {})}>
      <TaskCard
        task={task}
        showProject
        showStatus={false}
        className={isDragging ? 'opacity-40' : undefined}
        onClick={() => onOpen(task.id!)}
      />
    </div>
  )
}
