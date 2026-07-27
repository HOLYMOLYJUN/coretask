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
