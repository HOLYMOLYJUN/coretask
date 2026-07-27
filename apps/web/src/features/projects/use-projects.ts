import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'

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

/**
 * 보관된 프로젝트 (US-205 AC-1).
 * 활성 목록과 키를 나눈다 — 같은 키에 두 모양을 담으면 서로 덮어쓴다 (위 주석 참조).
 */
export function useArchivedProjects() {
  return useQuery({
    queryKey: qk.archivedProjects(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_project_stats')
        .select('*')
        .eq('project_status', 'archived')
        .order('name')
      if (error) throw error
      return (data ?? []).filter((p): p is typeof p & { project_id: string } => !!p.project_id)
    },
  })
}

/** 보관 · 복구 (US-205 AC-1·2). 개인 업무 차단은 tg_guard_personal_project 가 한다 */
export function useSetProjectStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { projectId: string; status: 'active' | 'archived' }) => {
      const { error } = await supabase
        .from('projects')
        .update({ status: v.status })
        .eq('id', v.projectId)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === 'archived' ? '프로젝트를 보관했어요' : '프로젝트를 되살렸어요')
      qc.invalidateQueries({ queryKey: qk.projects() })
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}

/**
 * 삭제 (US-205 AC-3·4). 보관된 프로젝트만 지울 수 있다 — projects_delete 정책.
 * Task·댓글·문서 링크는 FK cascade 로 함께 사라진다. 되돌릴 수 없다.
 */
export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', projectId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('프로젝트를 삭제했어요')
      qc.invalidateQueries({ queryKey: qk.projects() })
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}
