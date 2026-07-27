import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  ListChecks,
  Folder,
  Settings,
  Bell,
  Smartphone,
  ChevronRight,
  Lock,
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

/**
 * 아이콘은 본문색을 따라가지 않는다 (09-DESIGN-SYSTEM §3.3).
 * fill 을 섞어 쓰므로(D-052) 면적이 넓고, 그대로 두면 #0f172a 덩어리가 되어
 * 정작 주인공이어야 할 본문·카드보다 무거워진다.
 * 기본은 muted, 활성 항목만 본문색으로 올린다.
 */
const navItem =
  'flex items-center gap-3 rounded-md px-3 py-2 text-base transition-colors ' +
  'hover:bg-bg-subtle [&_svg]:text-fg-muted [&_svg]:transition-colors hover:[&_svg]:text-fg'

const navItemActive = 'bg-bg font-semibold [&_svg]:text-fg'

/**
 * 프로젝트 하위 트리 (10-UX-AUDIT §5-2).
 *
 * 이전에는 `최근` 이름으로 상위 3개만 보여줬다. 4번째 프로젝트부터는
 * `프로젝트` → 목록 → 클릭으로 2클릭이 들어 D-030(배정 보드가 3클릭 깊이에
 * 있으면 안 된다)을 지키지 못했다. 이름도 최근이 아니라 정렬 상위 3개였다.
 *
 * 펼침 상태는 기억한다 — 매번 다시 펴게 하면 트리가 아니라 장애물이 된다.
 */
const TREE_KEY = 'core_task.sidebar.projects.open'

function ProjectTree({
  projects,
  pathname,
}: {
  projects: ReturnType<typeof useProjects>['data']
  pathname: string
}) {
  const [open, setOpen] = useState(() => localStorage.getItem(TREE_KEY) !== '0')

  useEffect(() => {
    localStorage.setItem(TREE_KEY, open ? '1' : '0')
  }, [open])

  const list = projects ?? []
  // 개인 업무는 맨 아래 고정 — 프로젝트가 늘어도 위치가 변하지 않아야 한다
  const sorted = [...list].sort((a, b) => Number(a.is_personal) - Number(b.is_personal))
  const onProjects = pathname === '/projects'

  return (
    <div>
      <div className={cn(navItem, 'gap-0 pr-1', onProjects && navItemActive)}>
        <NavLink to="/projects" className="flex flex-1 items-center gap-3">
          <Folder size={18} strokeWidth={1.5} fill="currentColor" />
          프로젝트
        </NavLink>
        {list.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? '프로젝트 접기' : '프로젝트 펼치기'}
            aria-expanded={open}
            className="rounded p-1 text-fg-muted transition-colors hover:bg-bg hover:text-fg"
          >
            <ChevronRight
              size={14}
              strokeWidth={2}
              className={cn('transition-transform', open && 'rotate-90')}
            />
          </button>
        )}
      </div>

      {open && list.length > 0 && (
        // 프로젝트가 많아져도 트리 안에서만 스크롤한다 — 설정 버튼을 밀어내지 않게
        <nav className="mt-0.5 flex max-h-64 flex-col gap-0.5 overflow-y-auto border-l border-border pl-3 ml-5">
          {sorted.map((p) => {
            const active = pathname.startsWith(`/projects/${p.project_id}`)
            return (
              <NavLink
                key={p.project_id}
                to={`/projects/${p.project_id}/board`}
                className={cn(navItem, 'gap-2 py-1.5 text-xs', active && navItemActive)}
              >
                {p.is_personal ? (
                  <Lock size={13} strokeWidth={1.75} fill="currentColor" className="shrink-0" />
                ) : (
                  <Folder size={13} strokeWidth={1.5} fill="currentColor" className="shrink-0" />
                )}
                <span className="truncate">{p.name}</span>
              </NavLink>
            )
          })}
        </nav>
      )}
    </div>
  )
}

export function AppShell() {
  const { data: count = 0 } = useMyTaskCount()
  const { data: unread = 0 } = useUnreadCount()
  const { data: projects = [] } = useProjects()
  const loc = useLocation()

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
          <NavLink to="/" end className={({ isActive }) => cn(navItem, isActive && navItemActive)}>
            <LayoutDashboard size={18} strokeWidth={1.5} fill="currentColor" />
            대시보드
          </NavLink>

          <NavLink to="/tasks" className={({ isActive }) => cn(navItem, isActive && navItemActive)}>
            <ListChecks size={18} strokeWidth={1.75} />
            <span className="flex-1">내 업무</span>
            {count > 0 && (
              <span className="num rounded-full bg-fg px-1.5 text-badge text-white">
                {count > 20 ? '20+' : count}
              </span>
            )}
          </NavLink>

          <ProjectTree projects={projects} pathname={loc.pathname} />
        </nav>

        <div className="mt-auto px-3 pb-4">
          <NavLink to="/settings" className={({ isActive }) => cn(navItem, isActive && navItemActive)}>
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
