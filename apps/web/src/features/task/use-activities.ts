import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'
import type { Enums } from '@/lib/supabase'

/**
 * US-603 — 활동 로그.
 * 쓰기는 security definer 트리거만 한다 (activities 에 INSERT 정책이 없다).
 * 여기서는 읽기만 있다 — 클라이언트가 이력을 만들 방법은 없다.
 */

export type ActivityType = Enums['activity_type']

export interface Activity {
  id: string
  type: ActivityType
  /** 행위자. 스스로 가져간 배정인지 판정하는 데 쓴다 */
  user_id: string | null
  payload: { from?: string | null; to?: string | null } | null
  via_admin: boolean
  created_at: string
  actor: { name: string } | null
}

export function useActivities(taskId: string) {
  return useQuery({
    queryKey: qk.taskTimeline(taskId),
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('id, type, user_id, payload, via_admin, created_at, actor:profiles(name)')
        .eq('task_id', taskId)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as Activity[]
    },
  })
}
