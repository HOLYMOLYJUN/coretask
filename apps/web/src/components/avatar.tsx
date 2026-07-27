import { cn } from '@/lib/cn'

/**
 * US-104 AC-2 — 아바타가 없으면 이름 첫 글자 원형을 쓴다.
 * 회색 실루엣 아이콘을 두지 않는다: 열 명이 모이면 전부 같은 모양이 되어
 * "누구인지" 라는 아바타의 유일한 일을 못 하게 된다.
 */

/** 이름에서 색을 유도한다 — 같은 사람은 어느 화면에서든 같은 색이다 */
const TONES = [
  'bg-[#DBEAFE] text-[#1E40AF]',
  'bg-[#DCFCE7] text-[#166534]',
  'bg-[#FEF3C7] text-[#92400E]',
  'bg-[#FCE7F3] text-[#9D174D]',
  'bg-[#E0E7FF] text-[#3730A3]',
  'bg-[#CCFBF1] text-[#115E59]',
]

function toneOf(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return TONES[h % TONES.length]
}

export function Avatar({
  name,
  url,
  size = 28,
  className,
}: {
  name: string
  url?: string | null
  size?: number
  className?: string
}) {
  const style = { width: size, height: size }

  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={style}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    )
  }

  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.round(size * 0.42) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        toneOf(name),
        className,
      )}
    >
      {name.trim().charAt(0) || '?'}
    </span>
  )
}
