import { createClient } from '@supabase/supabase-js'
import type { Database } from '@core-task/types'

/**
 * 클라이언트는 하나뿐이다 (D-042).
 * 서버 컴포넌트가 없으므로 브라우저/서버 두 벌을 만들 필요가 없고,
 * @supabase/ssr 쿠키 세션·갱신 미들웨어가 통째로 빠진다.
 *
 * service_role 키는 이 저장소에 존재하지 않는다 (SETUP §2-3).
 */
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다. apps/web/.env.local 을 확인하세요.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export type Tables = Database['public']['Tables']
export type Views = Database['public']['Views']
export type Enums = Database['public']['Enums']

export type TaskStatus = Enums['task_status']
export type TaskPriority = Enums['task_priority']
export type ProjectRole = Enums['project_role']
export type WorkspaceRole = Enums['workspace_role']

export type Task = Tables['tasks']['Row']
export type Project = Tables['projects']['Row']
export type Profile = Tables['profiles']['Row']
export type EnrichedTask = Views['v_tasks_enriched']['Row']
export type ProjectStats = Views['v_project_stats']['Row']
