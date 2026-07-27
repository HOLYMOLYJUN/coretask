import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, type WorkspaceRole } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'
import { useSession } from '@/features/auth/session'

/** US-1001 — 워크스페이스 · 멤버 설정 */

export interface WsMember {
  user_id: string
  role: WorkspaceRole
  name: string
  email: string
  avatar_url: string | null
  /** 참여 중인 공유 프로젝트 수 (개인 업무는 세지 않는다) */
  projects: number
}

export function useWorkspaceMembers() {
  return useQuery({
    queryKey: qk.members(),
    queryFn: async (): Promise<WsMember[]> => {
      const [{ data: rows, error }, { data: pm }] = await Promise.all([
        supabase.from('memberships').select('user_id, role, profiles(name, email, avatar_url)'),
        // RLS: Admin 은 워크스페이스의 모든 공유 프로젝트를 보므로 집계가 정확하다.
        // 일반 멤버에게는 자기가 속한 프로젝트만 보인다 — 그래서 이 수는 Admin 화면에서만 쓴다.
        supabase.from('project_members').select('user_id, projects!inner(is_personal)'),
      ])
      if (error) throw error

      const count = new Map<string, number>()
      for (const r of pm ?? []) {
        if ((r.projects as unknown as { is_personal: boolean })?.is_personal) continue
        count.set(r.user_id, (count.get(r.user_id) ?? 0) + 1)
      }

      return (rows ?? [])
        .map((m) => {
          const p = m.profiles as unknown as {
            name: string
            email: string
            avatar_url: string | null
          } | null
          return {
            user_id: m.user_id,
            role: m.role,
            name: p?.name ?? '이름 없음',
            email: p?.email ?? '',
            avatar_url: p?.avatar_url ?? null,
            projects: count.get(m.user_id) ?? 0,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    },
  })
}

/**
 * 제거 전에 보여줄 영향 (US-1001 AC-4).
 * 완료 업무는 담당자를 유지하므로 세지 않는다 (EC-4).
 */
export function useRemovalImpact(userId: string | null) {
  return useQuery({
    queryKey: [...qk.members(), 'impact', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assignee_id', userId!)
        .neq('status', 'done')
        .is('deleted_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useSetMemberRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { userId: string; role: WorkspaceRole }) => {
      const { error } = await supabase
        .from('memberships')
        .update({ role: v.role })
        .eq('user_id', v.userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('역할을 바꿨어요')
      qc.invalidateQueries({ queryKey: qk.members() })
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}

/** 제거 — 개인 업무 삭제·프로젝트 이탈·업무 미배정까지 트리거가 처리한다 (마이그레이션 25) */
export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('memberships').delete().eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('멤버를 제거했어요')
      qc.invalidateQueries({ queryKey: qk.members() })
      qc.invalidateQueries({ queryKey: qk.projects() })
      qc.invalidateQueries({ queryKey: ['board'] })
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}

/** 아직 수락되지 않은 초대 (US-1001 AC-2) */
export function usePendingInvites() {
  return useQuery({
    queryKey: qk.invitations(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('id, email, token, expires_at, project_id, projects(name)')
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCancelInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invitations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('초대를 취소했어요')
      qc.invalidateQueries({ queryKey: qk.invitations() })
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}

/** US-104 — 프로필. 이메일은 계정 식별자라 바꾸지 않는다 (AC-3) */
export function useUpdateProfile() {
  const qc = useQueryClient()
  const { userId } = useSession()
  return useMutation({
    mutationFn: async (v: { name?: string; avatar_url?: string | null }) => {
      const { error } = await supabase.from('profiles').update(v).eq('id', userId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('프로필을 저장했어요')
      qc.invalidateQueries({ queryKey: qk.me() })
      qc.invalidateQueries({ queryKey: qk.members() })
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}
