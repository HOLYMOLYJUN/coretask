import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Folder, Lock, Settings, LogOut, ChevronRight } from 'lucide-react'
import { useMe } from '@/features/auth/session'
import { signOutEverywhere } from '@/features/auth/sign-out'
import { useProjects } from '@/features/projects/use-projects'
import { Card, Spinner } from '@/components/ui'
import { Avatar } from '@/components/avatar'

/**
 * 모바일 `더보기` (IA §6) — 프로젝트 목록 · 설정 · 프로필.
 *
 * 하단 탭이 4개뿐이라 사이드바에 있던 것들이 여기로 모인다.
 * 프로젝트가 탭에 없는 이유는 모바일에서 배정 보드를 쓰지 않기 때문이고(D-026),
 * **조회는 여전히 필요하다** — 그 조회의 입구가 여기다.
 *
 * 데스크톱에서는 사이드바가 같은 일을 하므로 이 화면이 뜨지 않는다 (하단 탭이 md:hidden).
 */
export function MorePage() {
  const { data: me } = useMe()
  const projects = useProjects()
  const nav = useNavigate()
  const qc = useQueryClient()

  async function signOut() {
    // 데스크톱 계정 메뉴와 같은 경로를 쓴다 — 한쪽만 고치면 다른 쪽에서 사고가 난다
    await signOutEverywhere(qc)
    nav('/login', { replace: true })
  }

  // 개인 업무는 맨 아래 고정 — 사이드바 트리와 같은 순서 (shell.tsx)
  const list = [...(projects.data ?? [])].sort(
    (a, b) => Number(a.is_personal) - Number(b.is_personal),
  )

  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-semibold">더보기</h1>

      <Card className="mt-4 flex items-center gap-3 px-4 py-3">
        <Avatar name={me?.profile?.name ?? ''} url={me?.profile?.avatar_url} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">{me?.profile?.name}</p>
          <p className="truncate text-xs text-fg-muted">{me?.profile?.email}</p>
        </div>
      </Card>

      <h2 className="mt-6 text-lg font-semibold">프로젝트</h2>
      {projects.isPending ? (
        <Spinner />
      ) : (
        <Card className="mt-2 divide-y divide-border">
          {list.map((p) => (
            <Link
              key={p.project_id}
              to={`/projects/${p.project_id}/board`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-subtle"
            >
              {p.is_personal ? (
                <Lock size={16} strokeWidth={1.75} fill="currentColor" className="shrink-0 text-fg-muted" />
              ) : (
                <Folder size={16} strokeWidth={1.5} fill="currentColor" className="shrink-0 text-fg-muted" />
              )}
              <span className="min-w-0 flex-1 truncate text-base">{p.name}</span>
              <span className="num shrink-0 text-xs text-fg-muted">
                {p.done ?? 0}/{p.total ?? 0}
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-fg-subtle" />
            </Link>
          ))}
        </Card>
      )}

      <Card className="mt-6 divide-y divide-border">
        <Link
          to="/settings"
          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-subtle"
        >
          <Settings size={16} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
          <span className="flex-1 text-base">설정</span>
          <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-fg-subtle" />
        </Link>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-subtle"
        >
          <LogOut size={16} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
          <span className="flex-1 text-base">로그아웃</span>
        </button>
      </Card>
    </div>
  )
}
