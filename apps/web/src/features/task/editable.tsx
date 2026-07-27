import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * 인라인 편집 프리미티브.
 *
 * 편집 모드를 따로 두지 않는다 — "수정" 버튼 → 폼 → "저장" 은 세 걸음이고,
 * 오타 하나 고치는 데 세 걸음은 안 고치게 만든다.
 * 값을 누르면 그 자리에서 바뀌고, 벗어나면 저장된다.
 *
 * 읽기 권한만 있는 사람에게는 편집 힌트를 아예 주지 않는다 (PRD §4) —
 * 눌러봤자 안 되는 것을 눌러보게 만들지 않는다.
 */

/** 편집 가능할 때만 hover 배경을 준다. "여기 눌러도 된다"는 유일한 신호다 */
export function EditableShell({
  editable,
  onClick,
  className,
  children,
}: {
  editable: boolean
  onClick?: () => void
  className?: string
  children: ReactNode
}) {
  if (!editable) return <div className={className}>{children}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mx-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-bg-subtle',
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * 한 줄/여러 줄 텍스트. blur 에 저장하고 Escape 로 되돌린다.
 * Enter 는 제목에서만 저장한다 — 설명에서 Enter 는 줄바꿈이어야 한다.
 */
export function EditableText({
  value,
  editable,
  multiline,
  placeholder,
  className,
  inputClassName,
  maxLength,
  onSave,
}: {
  value: string
  editable: boolean
  multiline?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  maxLength?: number
  onSave: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (!editing || !ref.current) return
    const el = ref.current
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next === value.trim()) return
    // 제목은 비울 수 없다 (DB check: length between 1 and 200)
    if (!next && !multiline) {
      setDraft(value)
      return
    }
    onSave(next)
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        rows={multiline ? Math.max(3, draft.split('\n').length) : 1}
        maxLength={maxLength}
        placeholder={placeholder}
        className={cn(
          'w-full resize-none rounded-md border border-primary bg-bg px-1.5 py-1',
          'placeholder:text-fg-subtle focus:outline-none',
          inputClassName ?? className,
        )}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
            return
          }
          if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            commit()
          }
        }}
      />
    )
  }

  const empty = !value.trim()

  return (
    <EditableShell
      editable={editable}
      onClick={() => setEditing(true)}
      className={cn('block w-full py-1', className)}
    >
      <span className={cn('whitespace-pre-wrap', empty && 'text-fg-subtle')}>
        {empty ? (editable ? placeholder : '-') : value}
      </span>
    </EditableShell>
  )
}

/** select 를 값처럼 보이게 둔다 — 테두리는 hover 때만 나타난다 */
export function EditableSelect<T extends string>({
  value,
  editable,
  options,
  className,
  onSave,
}: {
  value: T
  editable: boolean
  options: { value: T; label: string }[]
  className?: string
  onSave: (next: T) => void
}) {
  const label = options.find((o) => o.value === value)?.label ?? '-'
  if (!editable) return <span className={className}>{label}</span>

  return (
    <select
      value={value}
      onChange={(e) => onSave(e.target.value as T)}
      className={cn(
        '-mx-1.5 cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 py-1',
        'transition-colors hover:bg-bg-subtle focus:border-primary focus:outline-none',
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
