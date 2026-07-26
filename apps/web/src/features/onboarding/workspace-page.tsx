import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { parseDbError } from '@/lib/errors'
import { qk } from '@/lib/query'
import { useMe } from '@/features/auth/session'
import { Button, Input, Spinner } from '@/components/ui'
import { extractInviteToken } from '@/features/invite/token'

/**
 * US-101 · US-102
 *
 * ⚠️ 길이 두 개여야 한다.
 * "워크스페이스 만들기" 만 있으면, 이미 있는 팀에 합류하려는 사람이
 * 어쩔 수 없이 같은 이름의 평행 회사를 만들게 된다 (2026-07-27 실제로 발생).
 */
export function WorkspaceSetupPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: me, isPending } = useMe()

  const [name, setName] = useState('')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)

  // 1인 1워크스페이스라 되돌아올 일이 없다 (D-022)
  if (isPending) return <Spinner />
  if (me?.workspaceId) return <Navigate to="/" replace />

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy('create')

    const { error } = await supabase.rpc('create_workspace', { p_name: name.trim() })
    if (error) {
      setBusy(null)
      toast.error(parseDbError(error).message)
      return
    }
    await qc.invalidateQueries({ queryKey: qk.me() })
    nav('/', { replace: true })
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const token = extractInviteToken(invite)
    if (!token) {
      toast.error('초대 링크 또는 코드를 확인해주세요')
      return
    }
    setBusy('join')

    const { error } = await supabase.rpc('accept_invitation', { p_token: token })
    if (error) {
      setBusy(null)
      toast.error(parseDbError(error).message)
      return
    }
    await qc.invalidateQueries({ queryKey: qk.me() })
    nav('/', { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="text-xl font-semibold">시작하기</h1>
      <p className="mt-2 text-xs text-fg-muted">
        새로 회사를 만들거나, 받은 초대로 팀에 합류하세요.
      </p>

      <form onSubmit={onCreate} className="mt-8 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">회사 이름</span>
          <Input
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="몬스터"
          />
        </label>
        <Button type="submit" variant="primary" disabled={!!busy || !name.trim()}>
          {busy === 'create' ? '만드는 중' : '워크스페이스 만들기'}
        </Button>
      </form>

      <div className="my-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-badge text-fg-subtle">또는</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onJoin} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">초대 링크</span>
          <Input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="http://localhost:3000/invite/..."
          />
        </label>
        <Button type="submit" disabled={!!busy || !invite.trim()}>
          {busy === 'join' ? '합류하는 중' : '초대로 합류하기'}
        </Button>
        <p className="text-badge text-fg-subtle">
          링크 전체를 붙여넣어도 되고, 코드만 넣어도 됩니다.
        </p>
      </form>
    </main>
  )
}
