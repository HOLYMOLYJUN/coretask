import { useEffect, useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * US-103 AC-2·3 — 모바일 첫 접속에 "홈 화면에 추가" 를 **한 번만** 권한다.
 *
 * 왜 대시보드 상단인가
 *   알림 화면에도 같은 안내가 있지만(notifications-page), 거기까지 가려면
 *   먼저 알림을 받아야 한다 — 홈 화면에 추가해야 알림이 오는데 순서가 뒤집혀 있다.
 *   첫 화면에서 한 번 말하고 물러난다.
 *
 * 왜 자동으로 설치 창을 띄우지 않는가
 *   권한·설치 요청은 사용자 제스처 안에서만 한다. 첫 진입 자동 팝업은 거의 항상
 *   거부당하고, 한 번 거부되면 되돌리기 어렵다 (Foundation §6.5 · push.ts 와 같은 규칙).
 *
 * 닫으면 다시 뜨지 않는다 (AC-3). 계정이 아니라 **기기**에 기억한다 —
 * 홈 화면 추가는 계정이 아니라 기기에 하는 일이다.
 */
const DISMISS_KEY = 'core_task.install-hint.dismissed'

/** Chromium 계열만 준다. 타입 정의가 표준에 없어 직접 좁힌다 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true

export function InstallHint() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  )
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    // 이 이벤트는 "아직 설치되지 않았다" 는 브라우저의 판단이기도 하다
    const onPrompt = (e: Event) => {
      e.preventDefault() // 브라우저 기본 배너를 막고 우리 자리에서 띄운다
      setPrompt(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const close = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  // 이미 홈 화면에서 열었으면 할 말이 없다. 데스크톱도 대상이 아니다 (AC-2 는 모바일)
  const isMobile = isIOS() || /Android/.test(navigator.userAgent)
  if (dismissed || isStandalone() || !isMobile) return null
  // iOS 는 설치 API 가 없어 안내만, 그 외에는 이벤트를 받은 경우에만 (설치 가능할 때만)
  if (!isIOS() && !prompt) return null

  return (
    <div className="mb-3 flex items-start gap-3 rounded-md border border-border bg-bg-subtle px-4 py-3">
      <Smartphone size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <b>홈 화면에 추가</b>하면 앱처럼 열리고, 업무 배정을 알림으로 받을 수 있어요
        </p>
        {isIOS() ? (
          <p className="mt-1 text-xs text-fg-muted">
            공유 버튼 → <b className="text-fg">홈 화면에 추가</b>를 눌러주세요
          </p>
        ) : (
          <Button
            variant="primary"
            className="mt-2 px-3 py-1.5 text-xs"
            onClick={async () => {
              await prompt!.prompt()
              await prompt!.userChoice
              // 수락이든 거부든 이 이벤트는 재사용할 수 없다 — 안내를 닫는다
              close()
            }}
          >
            홈 화면에 추가
          </Button>
        )}
      </div>
      <button
        onClick={close}
        aria-label="안내 닫기"
        className="shrink-0 rounded p-1 text-fg-subtle transition-colors hover:bg-bg hover:text-fg"
      >
        <X size={16} strokeWidth={1.75} />
      </button>
    </div>
  )
}
