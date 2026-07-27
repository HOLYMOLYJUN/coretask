import { useState } from 'react'
import { BellRing, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from '@/features/auth/session'
import { Button, Card } from '@/components/ui'
import { pushState, enablePush, type PushState } from './push'

/**
 * US-802 AC-5 — 설정에서 푸시 상태를 확인하고 켠다.
 *
 * 알림 목록의 배너는 "아직 안 켠 사람" 을 위한 것이라 켜고 나면 사라진다.
 * 여기는 반대로 **켜져 있다는 사실을 확인하러 오는 곳**이라 항상 상태를 보여준다 —
 * "왜 알림이 안 오지" 의 답이 이 화면에 있어야 한다.
 */
export function PushSettings() {
  const { userId } = useSession()
  const [state, setState] = useState<PushState>(() => pushState())
  const [busy, setBusy] = useState(false)

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold text-fg-muted">알림</h2>
      <Card className="flex items-center gap-3 p-4">
        {state === 'ios-needs-install' ? (
          <>
            <Smartphone size={18} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
            <p className="flex-1 text-xs text-fg-muted">
              <b className="text-fg">홈 화면에 추가</b>하면 알림을 켤 수 있어요
              <br />
              공유 버튼 → 홈 화면에 추가
            </p>
          </>
        ) : (
          <>
            <BellRing
              size={18}
              strokeWidth={1.75}
              className={cnTone(state)}
            />
            <p className="flex-1 text-xs">
              {state === 'granted' ? (
                <>
                  이 기기로 알림을 받고 있어요
                  <br />
                  <span className="text-badge text-fg-subtle">
                    업무 배정 · 리뷰 요청 · 완료 확정 · 멘션
                  </span>
                </>
              ) : state === 'denied' ? (
                <>
                  알림이 차단돼 있어요
                  <br />
                  <span className="text-badge text-fg-subtle">
                    브라우저 설정에서 이 사이트의 알림을 허용해주세요
                  </span>
                </>
              ) : state === 'unsupported' ? (
                <span className="text-fg-muted">이 브라우저는 푸시 알림을 지원하지 않아요</span>
              ) : (
                '알림을 켜면 업무 배정을 바로 알 수 있어요'
              )}
            </p>
            {state === 'default' && (
              <Button
                variant="primary"
                className="shrink-0 px-3 py-1.5 text-xs"
                disabled={busy || !userId}
                onClick={async () => {
                  if (!userId) return
                  setBusy(true)
                  const r = await enablePush(userId).catch((e: Error) => {
                    toast.error(`알림을 켜지 못했어요: ${e.message}`)
                    return null
                  })
                  setBusy(false)
                  if (!r) return
                  setState(r)
                  if (r === 'granted') toast.success('알림이 켜졌어요')
                }}
              >
                알림 켜기
              </Button>
            )}
          </>
        )}
      </Card>
    </section>
  )
}

function cnTone(state: PushState): string {
  if (state === 'granted') return 'shrink-0 text-status-done'
  if (state === 'denied') return 'shrink-0 text-danger'
  return 'shrink-0 text-primary'
}
