import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk, queryClient } from '@/lib/query'
import { reconcilePush } from '@/features/notifications/push'

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
  const prevUser = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    /**
     * 🔴 계정이 바뀌면 캐시를 무조건 비운다.
     *
     * 쿼리 키에 userId 가 들어가지 않으므로(qk.myTasks 등),
     * 로그아웃 버튼을 거치지 않고 /login 에서 바로 다른 계정으로 들어오면
     * 이전 사용자의 leadIds·업무·알림이 새 계정에 그대로 보인다.
     * 실제로 Member 에게 이전 Admin 세션의 "완료 확정" 버튼이 노출됐다 (2026-07-27).
     * AccountMenu 의 clear 는 정상 로그아웃 경로만 덮는다 — 여기가 최종 방어선이다.
     *
     * 🔴 캐시만으로는 부족했다. **푸시 구독은 브라우저에 남는다.**
     * queryClient 가 닿지 못하는 곳이라, 계정을 바꿔도 이전 사용자 앞으로 온 알림이
     * 계속 떴다 (2026-07-28). 같은 자리에서 구독도 함께 맞춘다.
     */
    const apply = (s: Session | null) => {
      const uid = s?.user.id ?? null
      const changed = prevUser.current !== uid
      if (prevUser.current !== undefined && changed) {
        queryClient.clear()
      }
      prevUser.current = uid
      setSession(s)
      // 토큰 갱신 때마다 돌지 않게 계정이 실제로 바뀐 순간에만
      if (changed && uid) void reconcilePush()
    }

    supabase.auth.getSession().then(({ data }) => {
      apply(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => apply(s))
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
