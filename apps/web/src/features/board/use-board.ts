import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, type EnrichedTask, type TaskPriority } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'

export const UNASSIGNED = '__unassigned__'

export interface BoardMember {
  user_id: string
  role: 'lead' | 'member'
  name: string
}

/** 댓글 멘션(US-602)도 같은 키로 캐시를 공유한다 */
export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: qk.projectMembers(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<BoardMember[]> => {
      const { data, error } = await supabase
        .from('project_members')
        .select('user_id, role, profiles(name)')
        .eq('project_id', projectId)
      if (error) throw error
      return (data ?? [])
        .map((m) => ({
          user_id: m.user_id,
          role: m.role,
          name: (m.profiles as { name: string } | null)?.name ?? '이름 없음',
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    },
  })
}

export function useBoard(projectId: string) {
  const members = useProjectMembers(projectId)

  const tasks = useQuery({
    queryKey: qk.board(projectId),
    queryFn: async (): Promise<EnrichedTask[]> => {
      // v_tasks_enriched 를 쓴다 — is_stale 판정에 프로젝트별 임계값이 필요하다 (D-027)
      const { data, error } = await supabase
        .from('v_tasks_enriched')
        .select('*')
        .eq('project_id', projectId)
        .neq('status', 'done')
        .order('position')
        .order('created_at') // position 동률(레거시 0)의 안정적 타이브레이크
      if (error) throw error
      return data ?? []
    },
  })

  return { members, tasks }
}

export interface MoveInput {
  taskId: string
  assigneeId: string | null
  due?: string | null
  /** 이 카드 뒤에 놓인다 (같은 컬럼의 이전 이웃) */
  beforeId?: string | null
  /** 이 카드 앞에 놓인다 (같은 컬럼의 다음 이웃) */
  afterId?: string | null
}

/** move_task RPC 와 같은 공식. 서버·클라이언트가 같은 값을 계산해야 한다 */
function midPosition(prev?: number | null, next?: number | null): number {
  if (prev == null && next == null) return 0
  if (prev == null) return (next as number) - 1024
  if (next == null) return (prev as number) + 1024
  return (prev + next) / 2
}

/**
 * 이동(배정 + 순서) — API §7 낙관적 업데이트 3단 고정
 *   ① onMutate  즉시 캐시 변경 → 카드가 바로 이동한다
 *   ② mutationFn 서버 반영
 *   ③ onError   롤백 + §6 문구
 *
 * 되돌릴 때 반드시 이유를 함께 보여준다. 카드만 슬쩍 돌아가면
 * 사용자는 자기 손이 미끄러졌다고 생각하고 같은 시도를 반복한다.
 */
export function useMoveTask(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (v: MoveInput) => {
      const { error } = await supabase.rpc('move_task', {
        p_task: v.taskId,
        p_assignee: v.assigneeId ?? undefined,
        p_before: v.beforeId ?? undefined,
        p_after: v.afterId ?? undefined,
        p_due: v.due ?? undefined,
      })
      if (error) throw error
    },
    onMutate: (v) => {
      const key = qk.board(projectId)
      const prev = qc.getQueryData<EnrichedTask[]>(key)

      if (prev) {
        // 서버(move_task)와 같은 공식으로 위치를 계산해 순서까지 즉시 반영한다.
        // 동기적으로 set 한다 — await 를 먼저 하면 한 프레임 이전 순서가 보인다.
        const pos = midPosition(
          prev.find((t) => t.id === v.beforeId)?.position,
          prev.find((t) => t.id === v.afterId)?.position,
        )
        qc.setQueryData<EnrichedTask[]>(
          key,
          prev
            .map((t) =>
              t.id === v.taskId
                ? { ...t, assignee_id: v.assigneeId, due_date: v.due ?? t.due_date, position: pos }
                : t,
            )
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        )
      }
      void qc.cancelQueries({ queryKey: key })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(qk.board(projectId), ctx?.prev)
      toast.error(parseDbError(e).message)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.board(projectId) })
      qc.invalidateQueries({ queryKey: qk.myTasks() })
    },
  })
}

/** US-403 — 미배정 업무 가져가기. 마감일 건너뛰기가 없다 */
export function useClaimTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { taskId: string; due: string }) => {
      const { error } = await supabase.rpc('claim_task', { p_task: v.taskId, p_due: v.due })
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.board(projectId) })
      qc.invalidateQueries({ queryKey: qk.myTasks() })
    },
  })
}

/**
 * 업무 생성.
 * 어느 컬럼에서 눌렀는지가 곧 담당자다 (US-301 AC-6의 핵심) —
 * 모달로 바뀐 뒤에도 그 값은 미리 채워진 채로 열린다 (create-task-dialog.tsx).
 */
export function useCreateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      title: string
      assigneeId: string | null
      createdBy: string
      due?: string | null
      priority?: TaskPriority
      description?: string | null
    }) => {
      const { error } = await supabase.from('tasks').insert({
        project_id: projectId,
        title: v.title,
        assignee_id: v.assigneeId,
        created_by: v.createdBy,
        due_date: v.due ?? null,
        priority: v.priority ?? 'normal',
        description: v.description ?? null,
      })
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.board(projectId) })
      qc.invalidateQueries({ queryKey: qk.myTasks() })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
