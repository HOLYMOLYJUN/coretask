import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'

/**
 * 프로젝트 목록의 유일한 소스.
 *
 * ⚠️ 이 훅이 존재하는 이유
 * 사이드바 · 대시보드 · 프로젝트 목록이 각각 `['projects']` 키에
 * 서로 다른 queryFn 을 붙이고 있었다. TanStack Query 는 키 하나당 캐시가 하나라
 * 나중에 refetch 한 쪽이 앞의 데이터를 덮어쓴다.
 * 사이드바 모양({id,name})이 덮어쓰면 project_id 가 undefined 가 되어
 * 링크가 /projects/undefined/board 로 나가고 빈 보드가 떴다.
 *
 * queryKey 를 팩토리로 통일해도 queryFn 이 여럿이면 소용이 없다.
 * **키 하나에는 모양 하나.**
 */
export function useProjects() {
  return useQuery({
    queryKey: qk.projects(),
    queryFn: async () => {
      // v_project_stats 가 name·is_personal 까지 담고 있어 병합이 필요 없다 (마이그레이션 14)
      const { data, error } = await supabase
        .from('v_project_stats')
        .select('*')
        .eq('project_status', 'active')
        .order('is_personal')
        .order('name')
      if (error) throw error
      return (data ?? []).filter((p): p is typeof p & { project_id: string } => !!p.project_id)
    },
  })
}
