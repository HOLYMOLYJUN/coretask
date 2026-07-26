import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { dueQuickChips } from '@/lib/date'
import { Button } from '@/components/ui'

/**
 * US-304 AC-3 · D-021b
 *
 * 드롭한 카드 바로 아래에서 열린다. 화면 중앙 모달이 아니다 —
 * 배정 흐름의 맥락을 끊지 않기 위해서다.
 *
 * 퀵칩이 이 흐름의 성패를 가른다. 달력 위젯을 열게 하면 배정 하나가 4클릭이 되고
 * Lead 는 "그냥 카톡으로 말하지" 로 돌아간다.
 *
 * allowSkip=false 는 가져가기(US-403 AC-5) 전용이다 —
 * 스스로 한 약속에 기한이 없으면 그건 약속이 아니다.
 */
export function DuePopover({
  x,
  y,
  allowSkip = true,
  onPick,
  onSkip,
}: {
  x: number
  y: number
  allowSkip?: boolean
  onPick: (due: string) => void
  onSkip: () => void
}) {
  const chips = dueQuickChips()
  const [custom, setCustom] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  return (
    <>
      {/* 스크림 — shadow 대신 이것이 "떠 있음"을 만든다 (D-055) */}
      <div className="fixed inset-0 z-40 bg-[rgba(15,23,42,.32)]" onClick={onSkip} />

      <div
        ref={ref}
        className="fixed z-50 w-60 rounded-lg border border-border-strong bg-bg p-3"
        style={{ left: Math.min(x, window.innerWidth - 260), top: Math.min(y, window.innerHeight - 240) }}
      >
        <p className="text-base font-semibold">언제까지?</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={() => onPick(c.value)}
              className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
            >
              {c.label}
            </button>
          ))}
        </div>

        {custom ? (
          <input
            type="date"
            autoFocus
            className="mt-3 w-full rounded-md border border-border px-2 py-1.5 text-xs"
            onChange={(e) => e.target.value && onPick(e.target.value)}
          />
        ) : (
          <button
            onClick={() => setCustom(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
          >
            <Calendar size={14} strokeWidth={1.75} />
            직접 선택
          </button>
        )}

        {allowSkip && (
          <div className="mt-3 flex justify-end border-t border-border pt-2">
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onSkip}>
              나중에 정하기
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
