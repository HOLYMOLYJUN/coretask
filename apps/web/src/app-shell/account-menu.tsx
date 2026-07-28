import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useMe } from '@/features/auth/session'
import { signOutEverywhere } from '@/features/auth/sign-out'

export function AccountMenu() {
  const { data: me } = useMe()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function signOut() {
    // 세션 · 캐시 · 푸시 구독을 한 번에 끊는다 (sign-out.ts)
    await signOutEverywhere(qc)
    nav('/login', { replace: true })
  }

  const initials = me?.profile?.name?.slice(0, 2) ?? ''

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="계정 메뉴"
        className="num grid h-8 w-8 place-items-center rounded-full border border-border bg-bg text-badge transition-colors hover:border-border-strong"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-border-strong bg-bg p-1"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-xs font-medium">{me?.profile?.name}</p>
            <p className="truncate text-badge text-fg-muted">{me?.profile?.email}</p>
          </div>
          <button
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
          >
            <LogOut size={16} strokeWidth={1.75} />
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
