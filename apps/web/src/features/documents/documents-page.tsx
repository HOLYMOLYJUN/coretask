import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, ExternalLink, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from '@/features/auth/session'
import { useLeadProjectIds } from '@/features/my-tasks/use-my-tasks'
import { Button, Card, EmptyState, Input, Spinner } from '@/components/ui'
import { relativeTime } from '@/lib/date'
import { cn } from '@/lib/cn'
import {
  useDocuments,
  useAddDocument,
  useRenameDocument,
  useDeleteDocument,
  guessSource,
  normalizeUrl,
  SOURCE_LABEL,
  type DocSource,
  type Document,
} from './use-documents'

/**
 * US-901 — 프로젝트 문서 링크.
 *
 * 프로젝트 안에만 있다. 최상위 사이드바에 두지 않는다 (D-013) —
 * 문서는 언제나 어떤 프로젝트의 문서이고, 전역 목록은 "어디 것인지" 를 잃는다.
 */
export function DocumentsPage() {
  const { projectId = '' } = useParams()
  const { data: docs, isPending } = useDocuments(projectId)
  const { data: leadIds } = useLeadProjectIds()
  const [adding, setAdding] = useState(false)

  const isLead = !!leadIds?.has(projectId)

  if (isPending) return <Spinner />

  return (
    <div className="px-4 py-6 md:px-6">
      <Link
        to={`/projects/${projectId}/board`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
        보드로
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          문서 <span className="num text-fg-muted">{docs?.length ?? 0}</span>
        </h1>
        <Button variant="primary" className="px-3 py-1.5 text-xs" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={2} />
          링크 추가
        </Button>
      </div>

      <p className="mt-1 text-badge text-fg-subtle">
        문서를 옮겨오지 않아요. 흩어진 링크를 한곳에 모아둡니다
      </p>

      {!docs?.length ? (
        <Card className="mt-4">
          <EmptyState
            title="아직 모아둔 링크가 없어요"
            description="Notion · Figma · Google Docs 주소를 붙여넣으면 출처를 알아서 알아봐요"
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                링크 추가
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="mt-4 flex max-w-2xl flex-col gap-2">
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} projectId={projectId} isLead={isLead} />
          ))}
        </ul>
      )}

      {adding && <AddDialog projectId={projectId} onClose={() => setAdding(false)} />}
    </div>
  )
}

const SOURCE_TONE: Record<DocSource, string> = {
  notion: 'border-border text-fg-muted',
  figma: 'border-border text-fg-muted',
  gdocs: 'border-border text-fg-muted',
  other: 'border-border text-fg-subtle',
}

function DocRow({
  doc,
  projectId,
  isLead,
}: {
  doc: Document
  projectId: string
  isLead: boolean
}) {
  const { userId } = useSession()
  const rename = useRenameDocument(projectId)
  const del = useDeleteDocument(projectId)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(doc.title)
  const [armed, setArmed] = useState(false)

  // AC-4: 등록자 또는 Lead
  const canManage = doc.created_by === userId || isLead

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <li>
      <Card className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-subtle">
        <span
          className={cn(
            'shrink-0 rounded-badge border px-1.5 py-0.5 text-badge',
            SOURCE_TONE[doc.source],
          )}
        >
          {SOURCE_LABEL[doc.source]}
        </span>

        {editing ? (
          <input
            autoFocus
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setEditing(false)
              if (title.trim() && title.trim() !== doc.title) {
                rename.mutate({ id: doc.id, title: title.trim() })
              } else setTitle(doc.title)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setTitle(doc.title)
                setEditing(false)
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-primary bg-bg px-1.5 py-0.5 text-xs focus:outline-none"
          />
        ) : (
          // AC-3: 새 탭에서 연다
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs hover:text-primary"
          >
            <span className="truncate">{doc.title}</span>
            <ExternalLink size={12} strokeWidth={1.75} className="shrink-0 text-fg-subtle" />
          </a>
        )}

        <span className="shrink-0 text-badge text-fg-subtle">
          {doc.creator?.name ?? '알 수 없음'} · {relativeTime(doc.created_at)}
        </span>

        {canManage && !editing && (
          <span className="flex shrink-0 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              className="text-badge text-fg-subtle hover:text-fg"
              onClick={() => setEditing(true)}
            >
              이름
            </button>
            <button
              className={cn(
                'text-badge',
                armed ? 'font-semibold text-danger' : 'text-fg-subtle hover:text-danger',
              )}
              disabled={del.isPending}
              onClick={() => (armed ? del.mutate(doc.id) : setArmed(true))}
            >
              {armed ? '정말 삭제' : '삭제'}
            </button>
          </span>
        )}
      </Card>
    </li>
  )
}

/** URL 을 먼저 받는다 — 출처와 제목 기본값이 거기서 나온다 */
function AddDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const add = useAddDocument(projectId)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [source, setSource] = useState<DocSource>('other')
  const [touchedSource, setTouchedSource] = useState(false)

  function onUrlChange(next: string) {
    setUrl(next)
    // 사용자가 직접 고른 뒤에는 덮어쓰지 않는다 (AC-2)
    if (!touchedSource) setSource(guessSource(next))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const normalized = normalizeUrl(url)
    if (!normalized) {
      toast.error('주소를 다시 확인해주세요')
      return
    }
    if (!title.trim() || add.isPending) return
    add.mutate({ title: title.trim(), url: normalized, source }, { onSuccess: onClose })
  }

  return (
    <>
      <div className="fixed inset-0 z-60 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="fixed left-1/2 top-1/2 z-70 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-bg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">링크 추가</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">주소</span>
            <Input
              autoFocus
              value={url}
              placeholder="https://www.notion.so/..."
              className="text-xs"
              onChange={(e) => onUrlChange(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">제목</span>
            <Input
              value={title}
              maxLength={120}
              placeholder="이 링크를 뭐라고 부를까요?"
              className="text-xs"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">출처</span>
            <select
              value={source}
              onChange={(e) => {
                setTouchedSource(true)
                setSource(e.target.value as DocSource)
              }}
              className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            >
              {(Object.keys(SOURCE_LABEL) as DocSource[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!url.trim() || !title.trim() || add.isPending}
          >
            추가
          </Button>
        </div>
      </form>
    </>
  )
}
