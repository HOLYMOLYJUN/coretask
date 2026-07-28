import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'

/**
 * 프로젝트 한 건 (US-203).
 *
 * 목록(useProjects)에서 골라 쓰지 않는다. 목록은 `active` 만 담고 통계 뷰라
 * 설명·고객사·기간 같은 원본 필드가 없다. 개요 화면이 필요한 것은 원본이다.
 */
export function useProject(projectId: string) {
  return useQuery({
    queryKey: qk.project(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * 진행률·상태별 건수 (AC-2·4).
 * 계산은 뷰가 한다 — 저장하지 않는다 (D-009).
 */
export function useProjectStats(projectId: string) {
  return useQuery({
    queryKey: qk.projectStats(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_project_stats')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}
