import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMe } from '@/features/auth/session'

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
    await supabase.auth.signOut()
    // 🔴 캐시를 반드시 비운다.
    // 남겨두면 다음에 로그인한 사람이 이전 사용자의 프로젝트·업무를 잠깐 보게 된다.
    // RLS 는 서버를 지키지만 이미 브라우저에 내려온 데이터는 못 지운다.
    qc.clear()
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
