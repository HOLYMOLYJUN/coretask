import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { disablePush } from '@/features/notifications/push'

/**
 * 로그아웃이 끊어야 하는 것은 세션 하나가 아니다.
 *
 * 이 브라우저에는 계정과 무관하게 남는 것이 둘 있다 —
 * **쿼리 캐시**(이전 사용자의 업무·권한)와 **푸시 구독**(이전 사용자 앞으로 오는 알림).
 * 둘 다 실제로 새어나간 적이 있다 (`1e1583b` · 2026-07-28).
 *
 * 로그아웃 입구가 데스크톱 계정 메뉴와 모바일 `더보기` 두 곳이라 함수로 묶는다.
 * 한쪽만 고치면 다른 쪽에서 같은 사고가 난다.
 */
export async function signOutEverywhere(qc: QueryClient): Promise<void> {
  // 세션이 살아 있는 동안 해야 한다 — RLS 가 auth.uid() 로 내 구독을 판정한다
  try {
    await disablePush()
  } catch {
    // 구독 해제 실패가 로그아웃을 막으면 안 된다.
    // 남은 행은 reconcilePush(다음 로그인) 와 410 정리가 뒤에서 걷어낸다
  }

  await supabase.auth.signOut()

  // 🔴 캐시를 반드시 비운다.
  // 남겨두면 다음에 로그인한 사람이 이전 사용자의 프로젝트·업무를 잠깐 보게 된다.
  // RLS 는 서버를 지키지만 이미 브라우저에 내려온 데이터는 못 지운다.
  qc.clear()
}
