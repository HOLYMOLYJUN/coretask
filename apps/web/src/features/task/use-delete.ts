import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'

/**
 * US-302 AC-4 — 삭제는 soft delete + 10초 Undo.
 * deleted_at 을 세우면 RLS(tasks_read)가 모든 조회에서 숨긴다.
 * 권한 판정은 tg_task_delete_validate 가 한다 — 클라이언트는 시도만 한다.
 *
 * ⚠️ 테이블 UPDATE 가 아니라 RPC 다 (마이그레이션 23).
 * PostgREST 의 UPDATE 는 RETURNING 을 달고 나가고, 그러면 SELECT 정책이
 * 변경 후의 행에도 걸린다 — 삭제된 행은 tasks_read 를 통과할 수 없다.
 */
export function useDeleteTask() {
  const qc = useQueryClient()

  const invalidate = (taskId: string) => {
    qc.invalidateQueries({ queryKey: qk.myTasks() })
    qc.invalidateQueries({ queryKey: qk.task(taskId) })
    qc.invalidateQueries({ queryKey: ['board'] })
    qc.invalidateQueries({ queryKey: ['projects'] }) // 진행률 건수가 바뀐다
  }

  const restore = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.rpc('restore_task', { p_task: taskId })
      if (error) throw error
    },
    onSuccess: (_d, taskId) => {
      toast.success('업무를 되돌렸어요')
      invalidate(taskId)
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.rpc('delete_task', { p_task: taskId })
      if (error) throw error
    },
    onSuccess: (_d, taskId) => {
      invalidate(taskId)
      // 확인은 이미 받았다 — 여기서는 되돌릴 기회만 준다 (US-302 AC-4)
      toast('업무를 삭제했어요', {
        duration: 10_000,
        action: { label: '되돌리기', onClick: () => restore.mutate(taskId) },
      })
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })
}
