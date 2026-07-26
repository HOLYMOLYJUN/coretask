import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import type { Location } from 'react-router'
import { AppShell } from '@/app-shell/shell'
import { AuthPage } from '@/features/auth/login-page'
import { WorkspaceSetupPage } from '@/features/onboarding/workspace-page'
import { InviteAcceptPage } from '@/features/invite/accept-page'
import { useMe, useSession } from '@/features/auth/session'
import { Spinner } from '@/components/ui'
import { ProjectsPage } from '@/features/projects/projects-page'
import { BoardPage } from '@/features/board/board-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { MyTasksPage } from '@/features/my-tasks/my-tasks-page'
import { TaskPage, TaskPanel } from '@/features/task/task-detail'
import { NotificationsPage } from '@/features/notifications/notifications-page'
import { Placeholder } from '@/components/placeholder'

/**
 * D-031 — 하나의 주소, 두 가지 표현.
 *
 * `location.state.backgroundLocation` 이 곧 "어디서 왔는가" 다.
 * 보드에서 카드를 클릭할 때만 이 state 를 실어 보내므로
 * 푸시 알림 · 직접 URL · 새로고침은 자동으로 전체 페이지가 된다.
 */
export function AppRoutes() {
  const location = useLocation()
  const state = location.state as { backgroundLocation?: Location } | null
  const bg = state?.backgroundLocation

  return (
    <>
      <Routes location={bg ?? location}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        {/* US-102 — 미로그인이면 페이지 안에서 가입으로 보낸다 */}
        <Route path="/invite/:token" element={<InviteAcceptPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/onboarding/workspace" element={<WorkspaceSetupPage />} />

          <Route element={<RequireWorkspace />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="/tasks" element={<MyTasksPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId/board" element={<BoardPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<Placeholder title="설정" />} />
              <Route path="/more" element={<Placeholder title="더보기" />} />

              {/* 전체 페이지 — 알림 · 직접 URL · 새로고침 */}
              <Route path="/tasks/:taskId" element={<TaskPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Placeholder title="찾을 수 없는 페이지" />} />
      </Routes>

      {/* 패널 — 보드에서 왔을 때만 위에 얹는다 */}
      {bg && (
        <Routes>
          <Route path="/tasks/:taskId" element={<TaskPanel />} />
        </Routes>
      )}
    </>
  )
}

function RequireAuth() {
  const { session, loading } = useSession()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return <Outlet />
}

/** 워크스페이스가 없으면 온보딩으로 강제 (US-101 AC-2) */
function RequireWorkspace() {
  const { data, isPending } = useMe()
  if (isPending) return <Spinner />
  if (!data?.workspaceId) return <Navigate to="/onboarding/workspace" replace />
  return <Outlet />
}
