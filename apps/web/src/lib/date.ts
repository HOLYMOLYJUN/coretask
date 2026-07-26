import {
  differenceInCalendarDays,
  format,
  nextFriday,
  addDays,
  isFriday,
  parseISO,
} from 'date-fns'
import { ko } from 'date-fns/locale'

/** 'YYYY-MM-DD' (DB date 컬럼과 같은 표현) */
export type DateStr = string

export const toDateStr = (d: Date): DateStr => format(d, 'yyyy-MM-dd')
export const fromDateStr = (s: DateStr): Date => parseISO(s)

/**
 * 마감일 퀵칩 (D-034)
 * 재검토 신호: `직접 선택` 사용률이 40% 를 넘으면 구성이 틀린 것이다.
 */
export function dueQuickChips(today = new Date()) {
  // 오늘이 금요일이면 nextFriday 는 다음 주 금요일을 준다 → 그대로 쓴다
  const thisFri = isFriday(today) ? today : nextFriday(today)
  const nextFri = addDays(thisFri, 7)

  return [
    { label: '오늘', value: toDateStr(today) },
    { label: '내일', value: toDateStr(addDays(today, 1)) },
    { label: '이번주 금', value: toDateStr(thisFri) },
    { label: '다음주 금', value: toDateStr(nextFri) },
  ] as const
}

/** 마감까지 남은 일수. 음수면 초과 */
export function daysUntilDue(due: DateStr | null, today = new Date()): number | null {
  if (!due) return null
  return differenceInCalendarDays(fromDateStr(due), today)
}

/** `D-2` · `오늘` · `D+3` (US-402 AC-5) */
export function dueLabel(due: DateStr | null, today = new Date()): string | null {
  const d = daysUntilDue(due, today)
  if (d === null) return null
  if (d === 0) return '오늘'
  return d > 0 ? `D-${d}` : `D+${-d}`
}

/** `~7/28` */
export function dueShort(due: DateStr | null): string | null {
  return due ? `~${format(fromDateStr(due), 'M/d')}` : null
}

/** `화 7/28` — 이번주 마감 위젯 */
export function dueWithWeekday(due: DateStr): string {
  return format(fromDateStr(due), 'E M/d', { locale: ko })
}

/**
 * 상태 경과일 (D-015).
 * 캘린더가 알 수 없는 정보다 — status_changed_at 이후 실제 경과 시간이다.
 */
export function daysInStatus(statusChangedAt: string, now = new Date()): number {
  return Math.max(0, differenceInCalendarDays(now, new Date(statusChangedAt)))
}

export function elapsedLabel(statusChangedAt: string, now = new Date()): string {
  const d = daysInStatus(statusChangedAt, now)
  return d === 0 ? '오늘' : `${d}일`
}

/** `2시간 전` — 타임라인 */
export function relativeTime(iso: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  return format(new Date(iso), 'yyyy. M. d.')
}
