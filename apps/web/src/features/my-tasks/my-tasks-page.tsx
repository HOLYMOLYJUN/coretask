import { useNavigate, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase, type EnrichedTask, type TaskStatus } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { useSession } from '@/features/auth/session'
import { TaskCard } from '@/features/board/task-card'
import { STATUS_LABEL } from '@/components/status'
import { Spinner, EmptyState } from '@/components/ui'
import { Lock } from 'lucide-react'

const COLS: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']

/**
 * US-501. 배정 보드와 같은 Task.status 를 공유한다 — 화면은 둘, 진실은 하나 (D-005).
 * M1 은 조회까지. 드래그 상태 변경은 M2 다.
 */
export function MyTasksPage() {
  const { userId } = useSession()
  const nav = useNavigate()
  const loc = useLocation()

  const { data, isPending } = useQuery({
    queryKey: qk.myTasks(),
    enabled: !!userId,
    queryFn: async (): Promise<EnrichedTask[]> => {
      const { data, error } = await supabase
        .from('v_tasks_enriched')
        .select('*')
        .eq('assignee_id', userId!)
        .order('position')
      if (error) throw error
      return data ?? []
    },
  })

  if (isPending) return <Spinner />

  const open = (id: string) => nav(`/tasks/${id}`, { state: { backgroundLocation: loc } })

  if (!data?.length) {
    return (
      <div className="px-4 py-6 md:px-6">
        <h1 className="text-xl font-semibold">내 업무</h1>
        <EmptyState title="아직 배정된 업무가 없어요" description="프로젝트 보드에서 업무를 가져올 수 있어요" />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <h1 className="text-xl font-semibold">내 업무</h1>

      <div className="mt-4 flex gap-3 overflow-x-auto">
        {COLS.map((status) => {
          const list = data.filter((t) => t.status === status)
          const locked = status === 'done' // 팀원은 완료 컬럼에 드롭할 수 없다 (US-501 AC-5)
          return (
            <div key={status} className="flex w-64 shrink-0 flex-col">
              <div className="mb-2 flex items-baseline justify-between border-b border-border-strong pb-2">
                <span className="text-base font-semibold">{STATUS_LABEL[status]}</span>
                <span className="num text-xs text-fg-muted">{list.length}</span>
              </div>

              {locked ? (
                <div className="rounded-md border border-dashed border-border bg-bg-subtle px-3 py-8 text-center">
                  <Lock size={20} strokeWidth={1.75} className="mx-auto text-fg-subtle" />
                  <p className="mt-2 text-xs text-fg-muted">Lead가 확정합니다</p>
                  {list.length > 0 && (
                    <p className="mt-2 text-xs text-fg-subtle">완료 {list.length}건</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {list.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      showProject
                      showStatus={false}
                      onClick={() => open(t.id!)}
                    />
                  ))}
                  {!list.length && (
                    <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-fg-subtle">
                      비어 있어요
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
