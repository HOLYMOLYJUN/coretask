import { QueryClient } from '@tanstack/react-query'

/**
 * queryKey 는 이 팩토리로만 만든다 (08-FRONTEND §5.1).
 * 문자열을 손으로 쓰면 invalidate 가 조용히 어긋난다.
 */
export const qk = {
  session: () => ['session'] as const,
  me: () => ['me'] as const,

  workspace: () => ['workspace'] as const,
  members: () => ['workspace', 'members'] as const,

  projects: () => ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  projectMembers: (id: string) => ['projects', id, 'members'] as const,
  projectStats: (id: string) => ['projects', id, 'stats'] as const,
  leadProjects: () => ['projects', 'lead'] as const, // v_my_lead_projects (D-038)

  board: (projectId: string) => ['board', projectId] as const,
  myTasks: () => ['my-tasks'] as const,
  task: (taskId: string) => ['task', taskId] as const,
  taskTimeline: (taskId: string) => ['task', taskId, 'timeline'] as const,

  notifications: () => ['notifications'] as const,
  documents: (projectId: string) => ['documents', projectId] as const,
} as const

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // D-035: Realtime 을 껐으므로 포커스 복귀 시 재조회가 그 대체 수단이다
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      retry: 1,
    },
    mutations: { retry: 0 },
  },
})
