import { supabase } from '@/lib/supabase'

/**
 * US-802 — 푸시 구독.
 *
 * 권한 요청은 반드시 사용자 제스처("알림 켜기" 클릭) 안에서만 한다.
 * 첫 진입 자동 팝업은 거의 항상 거부당하고, 한 번 거부되면 되돌리기 어렵다 (Foundation §6.5).
 */

export type PushState = 'granted' | 'denied' | 'default' | 'unsupported' | 'ios-needs-install'

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true

export function pushState(): PushState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // iOS 사파리 탭에는 PushManager 자체가 없다 — 홈 화면 추가 후에만 생긴다
    return isIOS() && !isStandalone() ? 'ios-needs-install' : 'unsupported'
  }
  return Notification.permission as PushState
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function enablePush(userId: string): Promise<PushState> {
  const state = pushState()
  if (state === 'unsupported' || state === 'ios-needs-install' || state === 'denied') return state

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('VITE_VAPID_PUBLIC_KEY 가 빌드에 없다 — 배포 환경변수 누락')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission as PushState

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    }))

  const json = sub.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) return 'unsupported'

  // endpoint 가 unique — 같은 기기의 재구독은 덮어쓴다
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
  return 'granted'
}

/** 이 브라우저가 들고 있는 푸시 구독 (없으면 null) */
async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/**
 * 🔴 로그아웃 시 이 기기의 구독을 끊는다.
 *
 * **구독은 계정이 아니라 브라우저에 묶여 있다.** `push_subscriptions.endpoint` 가
 * unique 인 이유가 그것이다. 그래서 로그아웃만 하고 구독을 남겨두면,
 * 같은 브라우저로 다른 사람이 로그인해도 발송은 **이전 사용자 기준**으로 계속된다 —
 * 서비스워커에는 세션이 없어서 받은 것을 그대로 띄운다. 업무 제목까지 새어나간다.
 * (2026-07-28 확인: 이상준 로그아웃 → 유하우 로그인 후에도 이상준의 알림이 떴다)
 *
 * ⚠️ 순서가 중요하다. DB 행을 먼저 지운다 — `push_own` 정책이 `auth.uid()` 를 보므로
 * `signOut()` 뒤에는 지울 수 없다. 지우는 범위도 그 정책이 정한다: 내 행만이다.
 */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/**
 * 계정이 바뀐 기기 정리 — session.tsx 의 캐시 초기화와 같은 자리의 최종 방어선.
 *
 * 정상 로그아웃 경로(disablePush)를 타지 않은 기기가 남는다:
 * `/login` 에서 바로 다른 계정으로 들어오거나, 이 수정 이전에 이미 어긋난 기기들이다.
 *
 * 내 구독이 아니면 **로컬에서만 끊는다.** 남의 행은 RLS 가 못 지우게 막는데 그게 맞다 —
 * 끊긴 endpoint 는 다음 발송에서 410 이 되고, send-push 가 그때 지운다 (API §5.2).
 */
export async function reconcilePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  // RLS 때문에 내 행이 아니면 0건이 온다 — 그 0건이 곧 "내 구독이 아니다" 는 답이다
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', sub.endpoint)
    .maybeSingle()
  if (!data) await sub.unsubscribe()
}
