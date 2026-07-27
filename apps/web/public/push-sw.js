/* core_task · 푸시 수신 핸들러 (US-802)
   vite-plugin-pwa 가 생성한 서비스워커에 importScripts 로 붙는다 (vite.config.ts).
   데이터 캐시는 여기서도 하지 않는다 — 이 파일은 알림 표시와 클릭 이동만 한다 (D-019b). */

self.addEventListener('push', (event) => {
  if (!event.data) return
  let d
  try {
    d = event.data.json()
  } catch {
    return
  }
  event.waitUntil(
    self.registration.showNotification(d.title ?? 'core_task', {
      body: d.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag, // 같은 알림의 재시도가 중복 표시되지 않게
      data: { url: d.url ?? '/' },
    }),
  )
})

/* 모든 알림은 반드시 특정 화면으로 착지한다 (User Flow §8) */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
