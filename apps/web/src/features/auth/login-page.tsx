import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'

/**
 * US-101. M1 은 이메일/비밀번호만 (SETUP §3-2 — Google OAuth 는 M3~M4).
 * 폼 라이브러리를 쓰지 않는다 — 입력 2개다 (08-FRONTEND §3.2).
 */
export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const next = sp.get('next') ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = isSignup
        ? await supabase.auth.signUp({
            email,
            password,
            options: { data: { name: name.trim() || email.split('@')[0] } },
          })
        : await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        toast.error(
          error.message.includes('Invalid login')
            ? '이메일 또는 비밀번호가 맞지 않아요'
            : error.message,
        )
        return
      }
      nav(next, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
        core_task
      </h1>
      <p className="mt-2 text-xs text-fg-muted">
        {isSignup ? '계정을 만들고 시작하세요' : '다시 오셨네요'}
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
        {isSignup && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">이름</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="김대표"
              autoComplete="name"
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">이메일</span>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">비밀번호</span>
          <Input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
          />
        </label>

        <Button type="submit" variant="primary" disabled={busy} className="mt-2">
          {busy ? '잠시만요' : isSignup ? '가입하기' : '로그인'}
        </Button>
      </form>

      <p className="mt-6 text-xs text-fg-muted">
        {isSignup ? '이미 계정이 있나요? ' : '계정이 없나요? '}
        <Link
          to={isSignup ? '/login' : '/signup'}
          className="text-primary underline underline-offset-4"
        >
          {isSignup ? '로그인' : '가입하기'}
        </Link>
      </p>
    </main>
  )
}
