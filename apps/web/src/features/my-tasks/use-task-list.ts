import { useQuery } from '@tanstack/react-query'
import { supabase, type EnrichedTask, type TaskStatus } from '@/lib/supabase'
import { qk } from '@/lib/query'

/**
 * US-504 — 최상위 Tasks 리스트 뷰의 데이터.
 *
 * 보드(useMyTasks)와 달리 **내 것으로 좁히지 않는다.** 범위를 정하는 것은 RLS 다 —
 * `tasks_read` 가 `is_project_member(project_id)` 를 보므로, 내가 속하지 않은
 * 프로젝트의 업무는 필터를 어떻게 열어도 오지 않는다 (AC-2 의 "내가 속한 프로젝트 범위").
 * 클라이언트가 범위를 판정하지 않는다 (08-FRONTEND §5.4).
 *
 * 필터를 클라이언트에서 거르지 않고 쿼리로 내려보내는 이유: 여기는 프로젝트 횡단이라
 * 전량을 받아 거를 근거가 없다. 보드의 필터 칩(US-404)이 재조회하지 않는 것과 반대다 —
 * 그쪽은 이미 한 프로젝트치를 손에 들고 있다.
 */

export type SortKey = 'due' | 'priority' | 'recent'

/** `all` = 전체, `unassigned` = 미배정, 그 외는 user_id */
export type AssigneeFilter = string

export interface TaskFilters {
  project: string | null
  assignee: AssigneeFilter
  status: TaskStatus | null
  from: string | null
  to: string | null
  sort: SortKey
}

/**
 * 한 화면에 놓을 수 있는 최대치. 넘으면 잘렸다고 **말한다** —
 * 조용히 자르면 "이게 전부" 로 읽힌다.
 */
export const LIST_LIMIT = 200

export function useTaskList(f: TaskFilters) {
  return useQuery({
    queryKey: qk.taskList({ ...f }),
    queryFn: async (): Promise<EnrichedTask[]> => {
      let q = supabase.from('v_tasks_enriched').select('*')

      if (f.project) q = q.eq('project_id', f.project)
      if (f.assignee === 'unassigned') q = q.is('assignee_id', null)
      else if (f.assignee !== 'all') q = q.eq('assignee_id', f.assignee)
      if (f.status) q = q.eq('status', f.status)
      if (f.from) q = q.gte('due_date', f.from)
      if (f.to) q = q.lte('due_date', f.to)

      if (f.sort === 'due') {
        // 마감일 없는 것은 맨 뒤 — "언제까지" 를 묻는 정렬에서 답이 없는 건 뒤다
        q = q.order('due_date', { ascending: true, nullsFirst: false })
      } else if (f.sort === 'priority') {
        // enum 이 ('low','normal','high') 순이라 desc 가 high 부터다 (마이그레이션 1)
        q = q.order('priority', { ascending: false }).order('due_date', {
          ascending: true,
          nullsFirst: false,
        })
      } else {
        q = q.order('updated_at', { ascending: false })
      }

      const { data, error } = await q.limit(LIST_LIMIT)
      if (error) throw error
      return data ?? []
    },
  })
}

export interface Person {
  id: string
  name: string
}

/**
 * 담당자 필터의 선택지 (AC-2).
 * 내가 속한 프로젝트의 멤버 전원 — `pm_read` 정책이 그 범위를 그대로 정한다.
 */
export function useVisiblePeople() {
  return useQuery({
    queryKey: qk.visiblePeople(),
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase
        .from('project_members')
        .select('user_id, profiles(name)')
      if (error) throw error

      const byId = new Map<string, string>()
      for (const m of data ?? []) {
        const name = (m.profiles as { name: string } | null)?.name
        if (m.user_id && !byId.has(m.user_id)) byId.set(m.user_id, name ?? '이름 없음')
      }
      return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    },
  })
}
