import { NavLink, Outlet, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  ListChecks,
  Folder,
  Settings,
  Bell,
  Smartphone,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { useSession } from '@/features/auth/session'
import { useProjects } from '@/features/projects/use-projects'
import { useUnreadCount } from '@/features/notifications/use-notifications'
import { AccountMenu } from './account-menu'
import { cn } from '@/lib/cn'

/**
 * 데스크톱 사이드바 3개 + 하단 설정 / 모바일 하단탭 4개 (IA §4, §6)
 * 이모지를 쓰지 않는다 — lucide 아이콘 (D-053)
 */

function useMyTaskCount() {
  const { userId } = useSession()
  return useQuery({
    queryKey: [...qk.myTasks(), 'count'],
    enabled: !!userId,
    queryFn: async () => {
      // assignee_id 필터가 필수다. RLS 는 프로젝트 동료의 업무까지 보여주므로
      // 필터가 없으면 "내 업무" 뱃지가 팀 전체 업무를 센다.
      const { count } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assignee_id', userId!)
        .in('status', ['todo', 'in_progress'])
      return count ?? 0
    },
  })
}

// 프로젝트 목록은 useProjects() 하나만 쓴다 — 키 하나에 모양 하나 (use-projects.ts 참조)

const navItem =
  'flex items-center gap-3 rounded-md px-3 py-2 text-base transition-colors ' +
  'hover:bg-bg-subtle'

export function AppShell() {
  const { data: count = 0 } = useMyTaskCount()
  const { data: unread = 0 } = useUnreadCount()
  const { data: projects = [] } = useProjects()
  const loc = useLocation()

  const recent = projects.slice(0, 3) // D-030

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      {/* ── 사이드바 (데스크톱) ─────────────────────────────── */}
      <aside className="hidden border-r border-border bg-bg-subtle md:flex md:flex-col">
        <div className="px-5 py-4">
          <NavLink to="/" className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            core_task
          </NavLink>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          <NavLink to="/" end className={({ isActive }) => cn(navItem, isActive && 'bg-bg font-semibold')}>
            <LayoutDashboard size={18} strokeWidth={1.5} fill="currentColor" />
            대시보드
          </NavLink>

          <NavLink to="/tasks" className={({ isActive }) => cn(navItem, isActive && 'bg-bg font-semibold')}>
            <ListChecks size={18} strokeWidth={1.75} />
            <span className="flex-1">내 업무</span>
            {count > 0 && (
              <span className="num rounded-full bg-fg px-1.5 text-badge text-white">
                {count > 20 ? '20+' : count}
              </span>
            )}
          </NavLink>

          <NavLink to="/projects" className={({ isActive }) => cn(navItem, isActive && 'bg-bg font-semibold')}>
            <Folder size={18} strokeWidth={1.5} fill="currentColor" />
            프로젝트
          </NavLink>
        </nav>

        {/* D-030: 배정 보드가 3클릭 깊이에 있으면 안 된다 */}
        {recent.length > 0 && (
          <div className="mt-6 px-3">
            <p className="px-3 pb-1 text-badge tracking-wider text-fg-subtle uppercase">최근</p>
            <nav className="flex flex-col gap-0.5">
              {recent.map((p) => {
                const active = loc.pathname.startsWith(`/projects/${p.project_id}`)
                return (
                  <NavLink
                    key={p.project_id}
                    to={`/projects/${p.project_id}/board`}
                    className={cn(navItem, 'text-xs', active && 'bg-bg font-semibold')}
                  >
                    <Folder size={14} strokeWidth={1.5} fill="currentColor" className="shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </NavLink>
                )
              })}
            </nav>
          </div>
        )}

        <div className="mt-auto px-3 pb-4">
          <NavLink to="/settings" className={({ isActive }) => cn(navItem, isActive && 'bg-bg font-semibold')}>
            <Settings size={18} strokeWidth={1.75} />
            설정
          </NavLink>
        </div>
      </aside>

      {/* ── 본문 ──────────────────────────────────────────── */}
      <div className="flex min-h-dvh flex-col pb-14 md:pb-0">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:px-6">
          <div className="flex-1" />
          <NavLink
            to="/notifications"
            className="relative rounded-full p-2 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
            aria-label={unread > 0 ? `알림 ${unread}개` : '알림'}
          >
            {/* 미읽음 = 주의를 끌어야 하는 것 → fill (09 §3.2) */}
            <Bell
              size={18}
              strokeWidth={unread > 0 ? 1.5 : 1.75}
              fill={unread > 0 ? 'currentColor' : 'none'}
            />
            {unread > 0 && (
              <span className="num absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1 text-badge text-white">
                {unread > 20 ? '20+' : unread}
              </span>
            )}
          </NavLink>
          <AccountMenu />
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* ── 하단 탭 (모바일) — IA §6 ────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-bg md:hidden">
        <MobileTab
          to="/"
          end
          icon={<LayoutDashboard size={20} strokeWidth={1.5} fill="currentColor" />}
          label="홈"
        />
        <MobileTab to="/tasks" icon={<ListChecks size={20} strokeWidth={1.75} />} label="내 업무" badge={count} />
        <MobileTab
          to="/notifications"
          icon={
            <Bell
              size={20}
              strokeWidth={unread > 0 ? 1.5 : 1.75}
              fill={unread > 0 ? 'currentColor' : 'none'}
            />
          }
          label="알림"
          badge={unread}
        />
        <MobileTab to="/more" icon={<Smartphone size={20} strokeWidth={1.75} />} label="더보기" />
      </nav>
    </div>
  )
}

function MobileTab({
  to,
  end,
  icon,
  label,
  badge,
}: {
  to: string
  end?: boolean
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-0.5 py-2 text-badge transition-colors',
          isActive ? 'font-bold text-fg' : 'text-fg-muted',
        )
      }
    >
      <span className="relative">
        {icon}
        {!!badge && badge > 0 && (
          <span className="num absolute -right-2 -top-1 rounded-full bg-fg px-1 text-badge text-white">
            {badge > 20 ? '20+' : badge}
          </span>
        )}
      </span>
      {label}
    </NavLink>
  )
}
