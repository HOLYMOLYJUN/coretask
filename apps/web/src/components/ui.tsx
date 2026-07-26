import { cn } from '@/lib/cn'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

/**
 * 최소 프리미티브.
 * shadcn 기본 컴포넌트는 shadow 를 쓰므로(D-055 위반) 필요한 것만 직접 둔다.
 * 층은 border 와 배경으로만 만든다.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white border-primary hover:bg-primary-hover hover:border-primary-hover',
  secondary: 'bg-bg text-fg border-border hover:border-border-strong',
  ghost: 'bg-transparent text-fg-muted border-transparent hover:bg-bg-subtle hover:text-fg',
  danger: 'bg-bg text-danger border-danger/40 hover:bg-danger-subtle hover:border-danger',
}

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2',
        'text-base font-medium transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-md border border-border bg-bg px-3 py-2 text-base',
        'placeholder:text-fg-subtle',
        'focus:border-primary focus:outline-none focus-visible:outline-2',
        'focus-visible:outline-primary focus-visible:outline-offset-2',
        className,
      )}
      {...props}
    />
  )
}

/** 층 1 — border 1px + bg (D-055) */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-md border border-border bg-bg', className)}>{children}</div>
  )
}

/** 12px 은 뱃지에서만 (D-054) */
export function Badge({
  children,
  tone = 'neutral',
  mono,
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'danger'
  mono?: boolean
  className?: string
}) {
  const tones = {
    neutral: 'border-border text-fg-muted',
    primary: 'border-primary/30 bg-primary-subtle text-primary',
    danger: 'border-danger/30 bg-danger-subtle text-danger',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-badge border px-1.5 py-0.5 text-badge',
        mono && 'num',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * 빈 상태 — 두 종류를 구분한다 (IA §8)
 *  안내형: 아직 하지 않은 상태 → 다음 행동 버튼
 *  달성형: 달성한 상태 → 버튼 없음. 여기에 [+추가] 를 두면 제품이 사용자를 오해하게 만든다
 */
export function EmptyState({
  title,
  description,
  action,
  achieved,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  achieved?: boolean
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      {icon && <div className={achieved ? 'text-status-done' : 'text-fg-subtle'}>{icon}</div>}
      <p className={cn('text-xs', achieved ? 'text-fg-muted' : 'text-fg')}>{title}</p>
      {description && <p className="text-xs text-fg-muted">{description}</p>}
      {!achieved && action}
    </div>
  )
}

export function Spinner({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-10 text-xs text-fg-muted">{label}</div>
  )
}
