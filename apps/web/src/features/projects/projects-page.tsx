import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Lock, FolderPlus, UserPlus, Archive, ArchiveRestore, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'
import { useMe } from '@/features/auth/session'
import { useLeadProjectIds } from '@/features/my-tasks/use-my-tasks'
import {
  useProjects,
  useArchivedProjects,
  useSetProjectStatus,
  useDeleteProject,
} from './use-projects'
import { InviteDialog } from '@/features/invite/invite-dialog'
import { Button, Card, EmptyState, Input, Spinner, Badge } from '@/components/ui'
import { cn } from '@/lib/cn'

/** US-201 · US-203. 목록 단계에서 이미 "어디를 봐야 하는지"가 보여야 한다 */
export function ProjectsPage() {
  const { data: me } = useMe()
  const [creating, setCreating] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [tab, setTab] = useState<'active' | 'archived'>('active')

  const { data, isPending } = useProjects()
  const { data: archived } = useArchivedProjects()

  // 마지막 하나를 되살리면 탭이 사라진다 — 빈 화면에 남지 않게 되돌려 놓는다
  const showing = tab === 'archived' && !archived?.length ? 'active' : tab

  if (isPending) return <Spinner />

  return (
    <div className="px-4 py-6 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">프로젝트</h1>
        {me?.isWorkspaceAdmin && (
          <div className="flex gap-2">
            <Button onClick={() => setInviting(true)}>
              <UserPlus size={18} strokeWidth={1.75} />팀원 초대
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={18} strokeWidth={1.75} />새 프로젝트
            </Button>
          </div>
        )}
      </div>

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}

      {creating && <CreateProjectDialog onClose={() => setCreating(false)} />}

      {/* 보관됨은 평소에 존재를 드러내지 않는다 — 보관한 것이 있을 때만 탭이 생긴다 */}
      {!!archived?.length && (
        <div className="mt-4 flex gap-1 border-b border-border">
          {(['active', 'archived'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-xs transition-colors',
                showing === t
                  ? 'border-primary font-semibold text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {t === 'active' ? '진행 중' : `보관됨 ${archived.length}`}
            </button>
          ))}
        </div>
      )}

      {showing === 'archived' ? (
        <ArchivedList projects={archived ?? []} />
      ) : (
        <>
      {data?.length === 0 && !creating && (
        <Card className="mt-4">
          <EmptyState
            icon={<FolderPlus size={32} strokeWidth={1.5} />}
            title={
              me?.isWorkspaceAdmin
                ? '첫 프로젝트를 만들어보세요'
                : '아직 참여 중인 프로젝트가 없어요'
            }
            description={me?.isWorkspaceAdmin ? undefined : '관리자에게 프로젝트 참여를 요청하세요'}
            action={
              me?.isWorkspaceAdmin ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  프로젝트 만들기
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {data?.map((s) => (
          <ProjectRow key={s.project_id} s={s} />
        ))}
      </div>
        </>
      )}
    </div>
  )
}

type Stats = NonNullable<ReturnType<typeof useProjects>['data']>[number]

function ProjectRow({ s }: { s: Stats }) {
  const { data: leadIds } = useLeadProjectIds()
  const setStatus = useSetProjectStatus()
  const progress = Number(s.progress ?? 0)
  // 개인 업무는 보관 대상이 아니다 (US-205 AC-5)
  const canArchive = !s.is_personal && !!leadIds?.has(s.project_id)

  return (
    <Card className="flex items-center gap-2 px-4 py-3 transition-colors hover:bg-bg-subtle">
      {/* 목록에서는 개요로 (US-203). 보드로 바로 가는 길은 사이드바 트리가 맡는다 —
          배정 보드가 3클릭 깊이에 있으면 안 된다는 D-030 은 그쪽에서 지켜진다 */}
      <Link to={`/projects/${s.project_id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-medium">{s.name}</span>
          {s.is_personal && (
            <Lock size={14} strokeWidth={1.75} fill="currentColor" className="text-fg-subtle" />
          )}
          <div className="flex-1" />
          {!!s?.in_review && <Badge tone="neutral">리뷰 {s.in_review}</Badge>}
          {!!s?.delayed && <Badge tone="danger">지연 {s.delayed}</Badge>}
          {!!s?.missing_due && <Badge tone="neutral">마감없음 {s.missing_due}</Badge>}
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div className="h-2 w-full max-w-56 overflow-hidden rounded-full bg-bg-sunken">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <span className="num text-xs">{progress}%</span>
          <span className="text-xs text-fg-muted">
            {s?.done ?? 0} / {s?.total ?? 0}
          </span>
        </div>
      </Link>

      {canArchive && (
        <button
          title="보관"
          aria-label={`${s.name} 보관`}
          disabled={setStatus.isPending}
          onClick={() => setStatus.mutate({ projectId: s.project_id, status: 'archived' })}
          className="shrink-0 rounded-md p-2 text-fg-subtle transition-colors hover:bg-bg-sunken hover:text-fg"
        >
          <Archive size={16} strokeWidth={1.75} />
        </button>
      )}
    </Card>
  )
}

/**
 * 보관됨 (US-205 AC-1·2·3).
 * 되돌리기를 먼저 두고 삭제를 뒤에 둔다 — 여기 온 사람 대부분은 되살리러 온다.
 */
function ArchivedList({ projects }: { projects: Stats[] }) {
  const setStatus = useSetProjectStatus()
  const [deleting, setDeleting] = useState<Stats | null>(null)

  return (
    <div className="mt-4 flex flex-col gap-2">
      {projects.map((s) => (
        <Card key={s.project_id} className="flex items-center gap-2 px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-base text-fg-muted">{s.name}</span>
          <span className="shrink-0 text-xs text-fg-subtle">업무 {s.total ?? 0}</span>
          <Button
            className="shrink-0 px-2.5 py-1.5 text-xs"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ projectId: s.project_id, status: 'active' })}
          >
            <ArchiveRestore size={14} strokeWidth={1.75} />
            되살리기
          </Button>
          <Button
            variant="danger"
            className="shrink-0 px-2.5 py-1.5 text-xs"
            onClick={() => setDeleting(s)}
          >
            삭제
          </Button>
        </Card>
      ))}

      {deleting && <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}

/**
 * 이름을 직접 입력받는다 (US-205 AC-3).
 * Task 는 10초 Undo 로 충분하지만 프로젝트 삭제는 되돌릴 수 없다 —
 * 무엇이 함께 사라지는지 건수로 보여준다 (AC-4).
 */
function DeleteProjectDialog({ project, onClose }: { project: Stats; onClose: () => void }) {
  const del = useDeleteProject()
  const [typed, setTyped] = useState('')
  const name = project.name ?? ''

  return (
    <>
      <div className="fixed inset-0 z-60 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-70 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-bg p-5">
        <h3 className="text-base font-semibold">프로젝트를 삭제할까요?</h3>
        <p className="mt-2 text-xs text-fg-muted">
          업무 <b className="text-fg">{project.total ?? 0}건</b>과 거기 달린 댓글·활동 기록·문서 링크가
          함께 삭제돼요. <b className="text-danger">되돌릴 수 없어요.</b>
        </p>
        <p className="mt-3 text-xs text-fg-muted">
          확인을 위해 <b className="text-fg">{name}</b> 을(를) 입력해주세요
        </p>
        <Input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          className="mt-1.5 text-xs"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="danger"
            disabled={typed.trim() !== name || del.isPending}
            onClick={() => del.mutate(project.project_id, { onSuccess: onClose })}
          >
            영구 삭제
          </Button>
        </div>
      </div>
    </>
  )
}

/**
 * 프로젝트 생성 모달.
 *
 * 필수 입력은 여전히 이름 하나뿐이다 (US-201 AC-2) — 나머지는 접어둔다.
 * 폼이 길어 보이면 프로젝트를 안 만들고 `개인 업무` 에 다 몰아넣는다 (Foundation §1).
 *
 * 만든 뒤에는 그 프로젝트 보드로 데려간다 (US-201 AC-4).
 * 목록에 한 줄 늘려놓고 끝내면 방금 만든 것을 사용자가 다시 찾아야 한다.
 */
function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [more, setMore] = useState(false)
  const [customer, setCustomer] = useState('')
  const [description, setDescription] = useState('')

  const mut = useMutation({
    mutationFn: async () => {
      // D-045: insert().select() 는 RLS 때문에 실패한다. RPC 를 쓴다
      const { data, error } = await supabase.rpc('create_project', {
        p_name: name.trim(),
        p_customer: customer.trim() || undefined,
        p_description: description.trim() || undefined,
      })
      if (error) throw error
      return data as { id: string } | null
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: qk.projects() })
      onClose()
      // US-201 AC-4 — 개요로 보낸다. 빈 보드에 떨어뜨리면 다음 행동이 안 보인다.
      // 개요가 생기기 전에는 목적지가 보드였다 (10-UX-AUDIT §3 → §7)
      if (project?.id) nav(`/projects/${project.id}`)
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim() && !mut.isPending) mut.mutate()
  }

  return (
    <>
      <div className="fixed inset-0 z-60 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <form
        onSubmit={onSubmit}
        className="fixed left-1/2 top-1/2 z-70 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-bg"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">새 프로젝트</h3>
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
          <Input
            autoFocus
            maxLength={60}
            placeholder="프로젝트 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {more ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-fg-muted">고객사 (선택)</span>
                <Input
                  className="text-xs"
                  maxLength={60}
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-fg-muted">설명 (선택)</span>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="resize-none rounded-md border border-border bg-bg px-2.5 py-2 text-xs placeholder:text-fg-subtle focus:border-primary focus:outline-none"
                />
              </label>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMore(true)}
              className="self-start text-badge text-fg-subtle hover:text-fg"
            >
              고객사 · 설명 추가
            </button>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || mut.isPending}>
            만들기
          </Button>
        </div>
      </form>
    </>
  )
}
