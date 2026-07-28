import { useNavigate, useSearchParams } from 'react-router'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { TaskStatus } from '@/lib/supabase'
import { useSession } from '@/features/auth/session'
import { useProjects } from '@/features/projects/use-projects'
import { STATUS_LABEL, StatusBadge } from '@/components/status'
import { Badge, Card, EmptyState, Spinner } from '@/components/ui'
import { dueShort, relativeTime } from '@/lib/date'
import { cn } from '@/lib/cn'
import {
  useTaskList,
  useVisiblePeople,
  LIST_LIMIT,
  type SortKey,
  type TaskFilters,
} from './use-task-list'

/**
 * US-504 — 최상위 Tasks 리스트 뷰.
 *
 * 사람 컬럼 보드를 여기 두지 않는다 (AC-4 · D-006a). 프로젝트를 넘나드는 화면에서
 * 사람으로 줄을 세우면 "이 사람 이번 주 뭐 해요" 를 프로젝트 밖에서 답하게 되고,
 * 그 순간 배정 보드가 두 벌이 된다. 여기서 사람은 **필터**지 축이 아니다.
 *
 * 필터·정렬은 전부 URL 이 소유한다 (08-FRONTEND §5.3) — 새로고침·공유에서 살아남는다.
 */

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'due', label: '마감일' },
  { key: 'priority', label: '우선순위' },
  { key: 'recent', label: '최근 변경' },
]

export function TaskListView() {
  const [sp, setSp] = useSearchParams()
  const { userId } = useSession()
  const nav = useNavigate()
  const projects = useProjects()
  const people = useVisiblePeople()

  // 기본 담당자는 나 — 이 화면의 이름은 여전히 `내 업무` 다
  const filters: TaskFilters = {
    project: sp.get('project'),
    assignee: sp.get('assignee') ?? userId ?? 'all',
    status: (STATUSES as string[]).includes(sp.get('status') ?? '')
      ? (sp.get('status') as TaskStatus)
      : null,
    from: sp.get('from'),
    to: sp.get('to'),
    sort: (SORTS.find((s) => s.key === sp.get('sort'))?.key ?? 'due') as SortKey,
  }

  const list = useTaskList(filters)

  /** view 는 유지한 채 파라미터 하나만 바꾼다 — 빈 값이면 URL 에서 지운다 */
  function set(key: string, value: string | null) {
    const next = new URLSearchParams(sp)
    if (value) next.set(key, value)
    else next.delete(key)
    setSp(next, { replace: true })
  }

  const nameOf = (id: string | null) =>
    id ? (people.data?.find((p) => p.id === id)?.name ?? '알 수 없음') : '미배정'

  const tasks = list.data ?? []
  const truncated = tasks.length === LIST_LIMIT

  return (
    <div className="mt-4">
      {/* ── 필터 (AC-3) ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="프로젝트"
          value={filters.project ?? ''}
          onChange={(v) => set('project', v)}
          options={[
            { value: '', label: '전체 프로젝트' },
            ...(projects.data ?? []).map((p) => ({ value: p.project_id, label: p.name ?? '' })),
          ]}
        />
        <Select
          label="담당자"
          value={filters.assignee}
          onChange={(v) => set('assignee', v)}
          options={[
            { value: 'all', label: '담당자 전체' },
            { value: 'unassigned', label: '미배정' },
            ...(people.data ?? []).map((p) => ({
              value: p.id,
              label: p.id === userId ? `${p.name} (나)` : p.name,
            })),
          ]}
        />
        <Select
          label="상태"
          value={filters.status ?? ''}
          onChange={(v) => set('status', v)}
          options={[
            { value: '', label: '상태 전체' },
            ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          ]}
        />

        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          마감
          <input
            type="date"
            aria-label="마감일 시작"
            value={filters.from ?? ''}
            onChange={(e) => set('from', e.target.value || null)}
            className="num rounded-md border border-border bg-bg px-2 py-1 text-xs"
          />
          <span aria-hidden>–</span>
          <input
            type="date"
            aria-label="마감일 종료"
            value={filters.to ?? ''}
            onChange={(e) => set('to', e.target.value || null)}
            className="num rounded-md border border-border bg-bg px-2 py-1 text-xs"
          />
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-fg-muted">정렬</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => set('sort', s.key === 'due' ? null : s.key)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                filters.sort === s.key
                  ? 'border-fg bg-fg font-semibold text-bg'
                  : 'border-border text-fg-muted hover:border-border-strong',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 표 ──────────────────────────────────────────────── */}
      {list.isPending ? (
        <Spinner />
      ) : !tasks.length ? (
        <Card className="mt-4">
          <EmptyState
            title="조건에 맞는 업무가 없어요"
            description="필터를 넓혀보세요"
          />
        </Card>
      ) : (
        <>
          {/* 좁은 화면에서는 표만 가로로 흐르게 한다 (done-page 와 같은 처리) */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-fg-muted">
                  <th className="py-2 pr-3 font-medium">업무</th>
                  <th className="py-2 pr-3 font-medium">프로젝트</th>
                  <th className="py-2 pr-3 font-medium">담당자</th>
                  <th className="py-2 pr-3 font-medium">상태</th>
                  <th className="py-2 pr-3 font-medium">마감</th>
                  <th className="py-2 font-medium">변경</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => nav(`/tasks/${t.id}`)}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-bg-subtle"
                  >
                    <td className="py-2.5 pr-3">
                      <span className="flex items-start gap-1">
                        {t.priority === 'high' && (
                          <ChevronUp
                            size={14}
                            strokeWidth={2.25}
                            className="mt-0.5 shrink-0 text-status-delayed"
                          />
                        )}
                        {t.priority === 'low' && (
                          <ChevronDown
                            size={14}
                            strokeWidth={2.25}
                            className="mt-0.5 shrink-0 text-fg-subtle"
                          />
                        )}
                        {t.title}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-fg-muted">{t.project_name}</td>
                    <td className="py-2.5 pr-3 text-fg-muted">{nameOf(t.assignee_id)}</td>
                    <td className="py-2.5 pr-3">
                      {t.status && <StatusBadge status={t.status} />}
                    </td>
                    <td className="num py-2.5 pr-3 text-fg-muted">
                      {dueShort(t.due_date) ?? '-'}
                      {t.is_overdue && (
                        <Badge tone="danger" className="ml-1.5">
                          지연
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 text-fg-muted">
                      {t.updated_at ? relativeTime(t.updated_at) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 잘렸으면 잘렸다고 말한다 */}
          {truncated && (
            <p className="mt-3 text-center text-xs text-fg-muted">
              최대 <span className="num">{LIST_LIMIT}</span>건까지 보여줘요. 필터를 좁혀주세요
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string | null) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
