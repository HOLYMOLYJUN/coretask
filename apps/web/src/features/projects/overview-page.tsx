import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { format } from 'date-fns'
import { LayoutGrid, Users, FileText, CheckCheck, Lock, Plus } from 'lucide-react'
import { useProject, useProjectStats } from './use-project'
import { useProjectMembers, useCreateTask, UNASSIGNED } from '@/features/board/use-board'
import { CreateTaskDialog } from '@/features/board/create-task-dialog'
import { MembersDialog } from '@/features/board/members-dialog'
import { useSession } from '@/features/auth/session'
import { useLeadProjectIds } from '@/features/my-tasks/use-my-tasks'
import { Avatar } from '@/components/avatar'
import { Button, Card, EmptyState, Spinner } from '@/components/ui'
import { fromDateStr } from '@/lib/date'
import { cn } from '@/lib/cn'

/**
 * US-203 — 프로젝트 개요.
 *
 * 보드가 "지금 누가 뭘 하나" 를 답한다면 여기는 **"이 프로젝트가 뭐고 어디까지 왔나"** 다.
 * 두 질문의 주기가 다르다 — 앞은 하루에 몇 번, 뒤는 주에 한 번.
 * 그래서 보드에 위젯으로 얹지 않고 화면을 나눈다.
 *
 * 프로젝트를 만든 직후 도착하는 곳이기도 하다 (US-201 AC-4).
 * 그때 필요한 것은 통계가 아니라 **다음 두 행동**이다 — 팀원 추가 · 첫 업무 만들기.
 */
export function ProjectOverviewPage() {
  const { projectId = '' } = useParams()
  const { userId } = useSession()
  const project = useProject(projectId)
  const stats = useProjectStats(projectId)
  const members = useProjectMembers(projectId)
  const { data: leadIds } = useLeadProjectIds()
  const create = useCreateTask(projectId)

  const [creating, setCreating] = useState(false)
  const [managingMembers, setManagingMembers] = useState(false)

  if (project.isPending || stats.isPending) return <Spinner />
  if (!project.data) {
    // RLS 가 막으면 0건이 온다 — 없는 것처럼 다룬다 (D-032)
    return (
      <div className="px-4 py-6 md:px-6">
        <EmptyState title="찾을 수 없는 프로젝트예요" />
      </div>
    )
  }

  const p = project.data
  const s = stats.data
  const total = Number(s?.total ?? 0)
  const progress = Number(s?.progress ?? 0)
  const isLead = !!leadIds?.has(projectId)

  const period = [p.start_date, p.end_date]
    .map((d) => (d ? format(fromDateStr(d), 'yyyy.M.d') : null))
    .join(' – ')
    .replace(/^ – | – $/, '')

  return (
    <div className="px-4 py-6 md:px-6">
      {/* ── 머리 ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {p.is_personal && (
              <Lock size={16} strokeWidth={1.75} fill="currentColor" className="text-fg-subtle" />
            )}
            <h1 className="text-xl font-semibold">{p.name}</h1>
            {p.status === 'archived' && (
              <span className="rounded-badge border border-border px-1.5 py-0.5 text-badge text-fg-muted">
                보관됨
              </span>
            )}
          </div>
          {p.description && <p className="mt-2 max-w-prose text-xs text-fg-muted">{p.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
            {p.customer && <span>고객사 {p.customer}</span>}
            {period && <span className="num">{period}</span>}
          </div>
        </div>

        <Link to={`/projects/${projectId}/board`}>
          <Button variant="primary" className="px-3 py-1.5 text-xs">
            <LayoutGrid size={14} strokeWidth={1.75} />
            배정 보드
          </Button>
        </Link>
      </div>

      {/* ── 진행률 · 상태별 건수 (AC-1·2·4) ──────────────────── */}
      <Card className="mt-5 p-4">
        {total === 0 ? (
          // AC-3 — 0/0 = 0% 를 보여주면 "안 하고 있다" 로 읽힌다. 아직 시작을 안 한 것이다
          <EmptyState
            title="아직 업무가 없어요"
            description="첫 업무를 만들면 여기에 진행률이 나타나요"
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={16} strokeWidth={2} />
                업무 만들기
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-sunken">
                <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
              <span className="num text-lg font-semibold">{progress}%</span>
              <span className="num text-xs text-fg-muted">
                {Number(s?.done ?? 0)} / {total}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="예정" value={Number(s?.todo ?? 0)} />
              <Stat label="진행중" value={Number(s?.in_progress ?? 0)} />
              <Stat label="리뷰중" value={Number(s?.in_review ?? 0)} />
              <Stat label="완료" value={Number(s?.done ?? 0)} />
            </div>

            {/* 손이 필요한 숫자만 따로 세운다 — 0이면 말하지 않는다 */}
            {(Number(s?.unassigned ?? 0) > 0 || Number(s?.delayed ?? 0) > 0) && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs">
                {Number(s?.unassigned ?? 0) > 0 && (
                  <Link
                    to={`/projects/${projectId}/board`}
                    className="text-fg-muted hover:text-fg"
                  >
                    미배정 <span className="num">{Number(s?.unassigned)}</span>건
                  </Link>
                )}
                {Number(s?.delayed ?? 0) > 0 && (
                  <Link
                    to={`/projects/${projectId}/board?filter=delayed`}
                    className="text-danger hover:underline"
                  >
                    지연 <span className="num">{Number(s?.delayed)}</span>건
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── 멤버 (AC-1) ─────────────────────────────────────── */}
      <div className="mt-6 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold">멤버</h2>
        <span className="num text-xs text-fg-muted">{members.data?.length ?? 0}</span>
        <button
          onClick={() => setManagingMembers(true)}
          className="ml-auto flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <Users size={14} strokeWidth={1.75} />
          {isLead ? '멤버 관리' : '멤버 보기'}
        </button>
      </div>

      <Card className="mt-2 p-4">
        {members.isPending ? (
          <Spinner />
        ) : (
          <ul className="flex flex-wrap gap-x-5 gap-y-3">
            {(members.data ?? []).map((m) => (
              <li key={m.user_id} className="flex items-center gap-2">
                <Avatar name={m.name} size={28} />
                <div className="min-w-0">
                  <p className="truncate text-xs">
                    {m.name}
                    {m.user_id === userId && <span className="ml-1 text-fg-subtle">(나)</span>}
                  </p>
                  <p className="text-badge text-fg-muted">
                    {m.role === 'lead' ? 'Lead' : 'Member'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── 나머지 입구 ─────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-2">
        <SubLink to={`/projects/${projectId}/docs`} icon={<FileText size={14} strokeWidth={1.75} />}>
          문서
        </SubLink>
        <SubLink
          to={`/projects/${projectId}/done`}
          icon={<CheckCheck size={14} strokeWidth={1.75} />}
        >
          완료된 업무
        </SubLink>
      </div>

      {creating && (
        <CreateTaskDialog
          members={members.data ?? []}
          defaultAssignee={UNASSIGNED}
          canAssign={isLead}
          busy={create.isPending}
          onCreate={(v) =>
            create.mutate(
              {
                title: v.title,
                assigneeId: v.assigneeId,
                createdBy: userId!,
                due: v.due,
                priority: v.priority,
                description: v.description,
              },
              { onSuccess: () => setCreating(false) },
            )
          }
          onClose={() => setCreating(false)}
        />
      )}

      {managingMembers && (
        <MembersDialog
          projectId={projectId}
          canManage={isLead}
          onClose={() => setManagingMembers(false)}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn('rounded-md border border-border px-3 py-2', !value && 'opacity-50')}>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="num text-lg font-semibold">{value}</p>
    </div>
  )
}

function SubLink({
  to,
  icon,
  children,
}: {
  to: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
    >
      {icon}
      {children}
    </Link>
  )
}
