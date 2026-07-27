import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { type BoardMember } from '@/features/board/use-board'
import { Button } from '@/components/ui'
import { relativeTime } from '@/lib/date'
import { cn } from '@/lib/cn'
import { useEditComment, useDeleteComment, extractMentions, type Comment } from './use-comments'

/**
 * US-602 — 댓글 UI.
 * 마크다운 없음. 줄바꿈과 링크 자동 인식까지만 (AC-5 — D-012 를 우회하지 않는다).
 * US-603 활동 로그가 이 타임라인에 섞여 들어온다 (별도 탭 금지).
 */

/** split 의 캡처 그룹 덕에 홀수 인덱스가 URL 이다 */
const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g

function CommentBody({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <p className="text-xs whitespace-pre-wrap wrap-break-word">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noreferrer"
            className="break-all text-primary underline underline-offset-2"
          >
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </p>
  )
}

/** 커서 앞의 `@검색어` — 멘션 자동완성의 트리거 */
function mentionQueryAt(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret)
  const m = /@([\p{L}\p{N}]*)$/u.exec(before)
  if (!m) return null
  return { start: m.index, query: m[1] }
}

export function MentionInput({
  members,
  busy,
  placeholder,
  initial = '',
  autoFocus,
  onSubmit,
  onCancel,
}: {
  members: BoardMember[]
  busy: boolean
  placeholder: string
  initial?: string
  autoFocus?: boolean
  onSubmit: (body: string) => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState(initial)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)

  const candidates = mention
    ? members.filter((m) => m.name.toLowerCase().includes(mention.query.toLowerCase()))
    : []
  const open = candidates.length > 0

  useEffect(() => setActive(0), [mention?.query])

  function sync(el: HTMLTextAreaElement) {
    setValue(el.value)
    setMention(mentionQueryAt(el.value, el.selectionStart))
  }

  function pick(m: BoardMember) {
    if (!mention || !ref.current) return
    const caret = ref.current.selectionStart
    const next = `${value.slice(0, mention.start)}@${m.name} ${value.slice(caret)}`
    setValue(next)
    setMention(null)
    const pos = mention.start + m.name.length + 2
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  function submit() {
    const body = value.trim()
    if (!body || busy) return
    onSubmit(body)
    setValue('')
    setMention(null)
  }

  return (
    <div className="relative">
      {open && (
        <ul className="absolute bottom-full left-0 z-10 mb-1 max-h-44 w-56 overflow-y-auto rounded-md border border-border-strong bg-bg py-1">
          {candidates.map((m, i) => (
            <li key={m.user_id}>
              <button
                type="button"
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs',
                  i === active ? 'bg-bg-subtle text-fg' : 'text-fg-muted',
                )}
                onMouseEnter={() => setActive(i)}
                // textarea 의 blur 보다 먼저 잡아야 한다
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(m)
                }}
              >
                @{m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          autoFocus={autoFocus}
          rows={value.includes('\n') ? 3 : 1}
          placeholder={placeholder}
          className="min-h-9 w-full flex-1 resize-none rounded-md border border-border bg-bg px-3 py-2 text-xs placeholder:text-fg-subtle focus:border-primary focus:outline-none"
          onChange={(e) => sync(e.target)}
          onClick={(e) => sync(e.currentTarget)}
          onBlur={() => setMention(null)}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => (a + 1) % candidates.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => (a - 1 + candidates.length) % candidates.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pick(candidates[active])
                return
              }
              if (e.key === 'Escape') {
                setMention(null)
                return
              }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
            if (e.key === 'Escape' && onCancel) onCancel()
          }}
        />
        {onCancel && (
          <Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button
          variant="primary"
          className="px-2.5 py-1.5 text-xs"
          disabled={!value.trim() || busy}
          onClick={submit}
          aria-label="댓글 등록"
        >
          <Send size={14} strokeWidth={2} />
        </Button>
      </div>
    </div>
  )
}

export function CommentItem({
  comment,
  members,
  canLead,
  taskId,
  isMine,
}: {
  comment: Comment
  members: BoardMember[]
  canLead: boolean
  taskId: string
  isMine: boolean
}) {
  const edit = useEditComment(taskId)
  const del = useDeleteComment(taskId)
  const [editing, setEditing] = useState(false)
  const [armed, setArmed] = useState(false)

  const edited = comment.updated_at > comment.created_at

  // 삭제는 2단 확인 — 다이얼로그 없이 그 자리에서 (3초 뒤 해제)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <li className="group">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold">{comment.author?.name ?? '알 수 없음'}</span>
        <span className="text-badge text-fg-subtle">
          {relativeTime(comment.created_at)}
          {edited && ' · 수정됨'}
        </span>
        <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {isMine && !editing && (
            <button
              className="text-badge text-fg-subtle hover:text-fg"
              onClick={() => setEditing(true)}
            >
              수정
            </button>
          )}
          {(isMine || canLead) && !editing && (
            <button
              className={cn('text-badge', armed ? 'font-semibold text-danger' : 'text-fg-subtle hover:text-danger')}
              disabled={del.isPending}
              onClick={() => (armed ? del.mutate(comment.id) : setArmed(true))}
            >
              {armed ? '정말 삭제' : '삭제'}
            </button>
          )}
        </span>
      </div>
      {editing ? (
        <div className="mt-1">
          <MentionInput
            members={members}
            busy={edit.isPending}
            placeholder=""
            initial={comment.body}
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={(body) =>
              edit.mutate(
                { id: comment.id, body, mentions: extractMentions(body, members) },
                { onSuccess: () => setEditing(false) },
              )
            }
          />
        </div>
      ) : (
        <div className="mt-0.5">
          <CommentBody text={comment.body} />
        </div>
      )}
    </li>
  )
}

// 목록·입력을 한데 묶는 섹션은 timeline.tsx 에 있다 —
// 댓글만 따로 보여줄 화면은 없기 때문이다 (US-603 AC-1).
