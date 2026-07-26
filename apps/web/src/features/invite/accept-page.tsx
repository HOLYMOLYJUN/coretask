import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { parseDbError } from '@/lib/errors'
import { qk } from '@/lib/query'
import { useSession, useMe } from '@/features/auth/session'
import { Button, Spinner } from '@/components/ui'

/**
 * US-102 — /invite/:token
 *
 * 미로그인이면 로그인/가입으로 보내되 돌아올 경로를 남긴다.
 * 초대 수락은 auth.uid() 가 필요하므로 반드시 로그인 후에 일어난다.
 */
export function InviteAcceptPage() {
  const { token = '' } = useParams()
  const { session, loading } = useSession()
  const { data: me, isPending } = useMe()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (loading || isPending || !session || ran.current) return
    if (me?.workspaceId) return
    ran.current = true
    ;(async () => {
      const { error } = await supabase.rpc('accept_invitation', { p_token: token })
      if (error) {
        setError(parseDbError(error).message)
        return
      }
      await qc.invalidateQueries({ queryKey: qk.me() })
      nav('/', { replace: true })
    })()
  }, [loading, isPending, session, me?.workspaceId, token, qc, nav])

  if (loading || isPending) return <Spinner />

  if (!session) {
    return <Navigate to={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`} replace />
  }

  // 이미 워크스페이스가 있으면 수락할 수 없다 (D-022)
  if (me?.workspaceId) {
    return (
      <Result
        title="이미 워크스페이스에 참여 중이에요"
        description="한 계정은 한 워크스페이스에만 속할 수 있습니다."
        onBack={() => nav('/', { replace: true })}
        backLabel="내 워크스페이스로"
      />
    )
  }

  if (error) {
    return (
      <Result
        title={error}
        description="초대한 분에게 새 링크를 요청해주세요."
        onBack={() => nav('/onboarding/workspace', { replace: true })}
        backLabel="처음으로"
      />
    )
  }

  return <Spinner label="초대를 확인하는 중" />
}

function Result({
  title,
  description,
  onBack,
  backLabel,
}: {
  title: string
  description: string
  onBack: () => void
  backLabel: string
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-xs text-fg-muted">{description}</p>
      <Button variant="primary" className="mt-2" onClick={onBack}>
        {backLabel}
      </Button>
    </main>
  )
}
