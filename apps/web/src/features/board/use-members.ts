import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, type ProjectRole } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'

/**
 * US-202 — 프로젝트 멤버 관리.
 *
 * 지금까지 프로젝트 멤버가 되는 경로는 "초대 수락" 하나뿐이었다 (D-033).
 * 그건 워크스페이스에 처음 들어올 때 한 번뿐이라,
 * 이미 가입한 사람을 새 프로젝트에 넣을 방법이 아예 없었다.
 *
 * 규칙은 전부 서버에 있다 — pm_manage 정책(Lead 만), tg_guard_last_lead(마지막 Lead 보호),
 * tg_member_removed(담당 업무 미배정 + Lead 알림). 여기서는 부르기만 한다.
 */

function useInvalidateMembers(projectId: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: qk.projectMembers(projectId) })
    qc.invalidateQueries({ queryKey: qk.board(projectId) })
    qc.invalidateQueries({ queryKey: qk.members() }) // 설정 화면의 "프로젝트 N"
  }
}

export function useAddProjectMember(projectId: string) {
  const invalidate = useInvalidateMembers(projectId)
  return useMutation({
    mutationFn: async (v: { userId: string; role: ProjectRole }) => {
      const { error } = await supabase
        .from('project_members')
        .insert({ project_id: projectId, user_id: v.userId, role: v.role })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('프로젝트에 추가했어요')
      invalidate()
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}

export function useSetProjectRole(projectId: string) {
  const invalidate = useInvalidateMembers(projectId)
  return useMutation({
    mutationFn: async (v: { userId: string; role: ProjectRole }) => {
      const { error } = await supabase
        .from('project_members')
        .update({ role: v.role })
        .eq('project_id', projectId)
        .eq('user_id', v.userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('역할을 바꿨어요')
      invalidate()
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}

export function useRemoveProjectMember(projectId: string) {
  const invalidate = useInvalidateMembers(projectId)
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('프로젝트에서 제외했어요')
      invalidate()
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}

/**
 * 제거하면 미배정으로 돌아갈 업무들 (US-202 AC-5 · US-204).
 * 건수만이 아니라 제목까지 준다 — "3건" 보다 "무엇" 이 판단에 필요하다.
 */
export function useRemovalPreview(projectId: string, userId: string | null) {
  return useQuery({
    queryKey: [...qk.projectMembers(projectId), 'removal', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('preview_member_removal', {
        p_project: projectId,
        p_user: userId!,
      })
      if (error) throw error
      return data ?? []
    },
  })
}
