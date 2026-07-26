import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'

/**
 * 세션만 Context 로 둔다 (08-FRONTEND §3.1).
 * 나머지 서버 데이터는 전부 TanStack Query 가 소유한다 —
 * 스토어에 복사하는 순간 D-005 · D-018 로 죽인 "두 벌의 진실"이 부활한다.
 */

interface SessionValue {
  session: Session | null
  userId: string | null
  loading: boolean
}

const Ctx = createContext<SessionValue>({ session: null, userId: null, loading: true })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{ session, userId: session?.user.id ?? null, loading }}>
      {children}
    </Ctx.Provider>
  )
}

export const useSession = () => useContext(Ctx)

/** 내 프로필 + 워크스페이스 소속. 온보딩 분기의 근거 (US-101 AC-2) */
export function useMe() {
  const { userId } = useSession()

  return useQuery({
    queryKey: qk.me(),
    enabled: !!userId,
    queryFn: async () => {
      // ⚠️ user_id 필터가 필수다.
      // RLS 는 "같은 워크스페이스 멤버십을 볼 수 있게" 해준다 — 내 것만 보이는 게 아니다.
      // 필터 없이 maybeSingle() 하면 팀원이 한 명이라도 들어오는 순간
      // 2행이 반환돼 에러가 나고, workspaceId 가 null 이 되어 온보딩으로 튕긴다.
      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId!).maybeSingle(),
        supabase
          .from('memberships')
          .select('workspace_id, role')
          .eq('user_id', userId!)
          .maybeSingle(),
      ])
      return {
        profile,
        workspaceId: membership?.workspace_id ?? null,
        workspaceRole: membership?.role ?? null,
        isWorkspaceAdmin: membership?.role === 'admin' || membership?.role === 'owner',
      }
    },
  })
}
