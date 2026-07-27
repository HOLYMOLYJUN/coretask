import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, type TaskPriority } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'

/**
 * US-302 · US-601 AC-3 — 업무 필드 수정.
 *
 * ⚠️ 왜 이게 늦게 생겼나
 * 마감일은 "배정할 때 묻는다"(D-021b)로만 구현돼 있었다. 그런데 내 컬럼에서 만든
 * 업무는 담당자가 처음부터 나라서 배정 이벤트가 영영 오지 않는다 →
 * 카드에 `마감일 없음` 경고를 띄우면서 고칠 수단이 없었다 (10-UX-AUDIT §1-A).
 * D-021b 는 배정 흐름의 규칙이지 "마감일은 배정으로만 넣는다"가 아니다.
 *
 * 권한 판정은 서버가 한다 — tasks_update 정책 + tg_task_validate.
 * 클라이언트는 시도하고, 거부되면 문구로 옮긴다.
 */

export interface TaskPatch {
  title?: string
  description?: string | null
  due_date?: string | null
  priority?: TaskPriority
  assignee_id?: string | null
}

export function useUpdateTask(taskId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (patch: TaskPatch) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', taskId)
      if (error) throw error
    },
    onError: (e) => toast.error(parseDbError(e).message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.task(taskId) })
      qc.invalidateQueries({ queryKey: qk.taskTimeline(taskId) }) // 마감일·담당자 변경은 기록에 남는다
      qc.invalidateQueries({ queryKey: qk.myTasks() })
      qc.invalidateQueries({ queryKey: ['board'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
