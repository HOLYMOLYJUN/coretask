import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, type EnrichedTask, type TaskStatus } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'
import { useSession } from '@/features/auth/session'

export function useMyTasks() {
  const { userId } = useSession()
  return useQuery({
    queryKey: qk.myTasks(),
    enabled: !!userId,
    queryFn: async (): Promise<EnrichedTask[]> => {
      const { data, error } = await supabase
        .from('v_tasks_enriched')
        .select('*')
        .eq('assignee_id', userId!)
        .order('position')
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * 내가 Lead 인 프로젝트 id 집합 — 완료 확정 가능 여부의 근거.
 * v_my_lead_projects 가 WS Admin 분기까지 흡수한다 (D-038).
 * `if (user.role === 'lead')` 같은 클라이언트 판정을 만들지 않는다 (08-FRONTEND §5.4).
 */
export function useLeadProjectIds() {
  return useQuery({
    queryKey: qk.leadProjects(),
    queryFn: async () => {
      const { data, error } = await supabase.from('v_my_lead_projects').select('id')
      if (error) throw error
      return new Set((data ?? []).map((p) => p.id!))
    },
  })
}

/**
 * 상태 변경 — API §7 낙관적 3단.
 * `in_review` 로 옮기는 것이 곧 리뷰 요청이다 (US-502).
 * 별도 버튼이 없으므로 알림도 DB 트리거가 보낸다 — 클라이언트가 할 일이 없다.
 */
export function useChangeStatus() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (v: { taskId: string; status: TaskStatus }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: v.status })
        .eq('id', v.taskId)
      if (error) throw error
    },
    onMutate: (v) => {
      const key = qk.myTasks()
      const prev = qc.getQueryData<EnrichedTask[]>(key)
      if (prev) {
        qc.setQueryData<EnrichedTask[]>(
          key,
          prev.map((t) =>
            t.id === v.taskId
              ? {
                  ...t,
                  status: v.status,
                  status_changed_at: new Date().toISOString(),
                  days_in_status: 0,
                  is_stale: false,
                }
              : t,
          ),
        )
      }
      void qc.cancelQueries({ queryKey: key })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(qk.myTasks(), ctx?.prev)
      toast.error(parseDbError(e).message)
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.myTasks() })
      qc.invalidateQueries({ queryKey: qk.task(v.taskId) })
      qc.invalidateQueries({ queryKey: ['board'] }) // 어느 프로젝트 보드든 (D-005 — 같은 status)
    },
  })
}

/** 반려 — 사유가 필수라 RPC 다 (US-503 AC-3). 상태 변경 + 사유 댓글 + 알림이 원자적 */
export function useRejectTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { taskId: string; reason: string }) => {
      const { error } = await supabase.rpc('reject_task', {
        p_task: v.taskId,
        p_reason: v.reason,
      })
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.myTasks() })
      qc.invalidateQueries({ queryKey: qk.task(v.taskId) })
      qc.invalidateQueries({ queryKey: ['board'] })
    },
  })
}

/** 현재 상태에서 담당자 본인이 할 수 있는 다음 행동 하나 (US-505 — 버튼은 하나만) */
export function nextAction(status: TaskStatus): { label: string; to: TaskStatus } | null {
  if (status === 'todo') return { label: '시작하기', to: 'in_progress' }
  if (status === 'in_progress') return { label: '리뷰 요청', to: 'in_review' }
  return null // in_review = 대기중, done = 끝
}
