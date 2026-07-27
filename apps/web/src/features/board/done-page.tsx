import { useNavigate, useParams, Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase, type EnrichedTask } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { useProjectMembers } from './use-board'
import { Spinner, EmptyState, Card } from '@/components/ui'
import { relativeTime, dueShort } from '@/lib/date'

/**
 * 프로젝트 완료 목록.
 *
 * 보드에는 완료가 없다 (D-005 — 컬럼은 사람이고, 완료 카드는 쿼리에서 빠진다).
 * 그래서 Lead 가 "지난주에 뭐가 끝났지" 를 물으면 답할 화면이 없었다.
 *
 * 여기서는 칸반을 쓰지 않는다. 끝난 일에 필요한 것은 배치가 아니라 대조다 —
 * 누가·언제·마감을 지켰는지를 같은 열에서 위아래로 훑을 수 있어야 한다.
 */
function useDoneTasks(projectId: string) {
  return useQuery({
    queryKey: qk.doneTasks(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<EnrichedTask[]> => {
      const { data, error } = await supabase
        .from('v_tasks_enriched')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'done')
        .order('completed_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

/** 마감 대비 결과 — 완료된 뒤에야 판정할 수 있다 */
function dueVerdict(t: EnrichedTask): { label: string; tone: string } | null {
  if (!t.due_date || !t.completed_at) return null
  const done = t.completed_at.slice(0, 10)
  if (done <= t.due_date) return { label: '기한 내', tone: 'text-fg-subtle' }
  return { label: '지연', tone: 'text-danger' }
}

export function ProjectDonePage() {
  const { projectId = '' } = useParams()
  const nav = useNavigate()
  const { data: tasks, isPending } = useDoneTasks(projectId)
  const { data: members } = useProjectMembers(projectId)

  const nameOf = (id: string | null) =>
    id ? (members?.find((m) => m.user_id === id)?.name ?? '알 수 없음') : '미배정'

  if (isPending) return <Spinner />

  return (
    <div className="px-4 py-6 md:px-6">
      <Link
        to={`/projects/${projectId}/board`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
        보드로
      </Link>

      <h1 className="text-xl font-semibold">
        완료된 업무 <span className="num text-fg-muted">{tasks?.length ?? 0}</span>
      </h1>

      {!tasks?.length ? (
        <Card className="mt-4">
          <EmptyState
            title="아직 완료된 업무가 없어요"
            description="리뷰를 거쳐 완료 확정된 업무가 여기 쌓입니다"
          />
        </Card>
      ) : (
        // 좁은 화면에서는 표가 가로로 흐른다 — 페이지 전체가 흔들리지 않게 표만 스크롤시킨다
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-fg-muted">
                <th className="py-2 pr-3 font-medium">업무</th>
                <th className="py-2 pr-3 font-medium">담당자</th>
                <th className="py-2 pr-3 font-medium">마감</th>
                <th className="py-2 font-medium">완료</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const verdict = dueVerdict(t)
                return (
                  <tr
                    key={t.id}
                    onClick={() => nav(`/tasks/${t.id}`)}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-bg-subtle"
                  >
                    <td className="py-2.5 pr-3">{t.title}</td>
                    <td className="py-2.5 pr-3 text-fg-muted">{nameOf(t.assignee_id)}</td>
                    <td className="py-2.5 pr-3 text-fg-muted">
                      <span className="num">{dueShort(t.due_date) ?? '-'}</span>
                      {verdict && <span className={`ml-1.5 ${verdict.tone}`}>{verdict.label}</span>}
                    </td>
                    <td className="py-2.5 text-fg-muted">
                      {t.completed_at ? relativeTime(t.completed_at) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
