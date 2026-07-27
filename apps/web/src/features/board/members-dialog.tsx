import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useSession } from '@/features/auth/session'
import { useWorkspaceMembers } from '@/features/settings/use-settings'
import { Avatar } from '@/components/avatar'
import { Button, Spinner } from '@/components/ui'
import { StatusBadge } from '@/components/status'
import { useProjectMembers, type BoardMember } from './use-board'
import {
  useAddProjectMember,
  useSetProjectRole,
  useRemoveProjectMember,
  useRemovalPreview,
} from './use-members'
import type { ProjectRole } from '@/lib/supabase'

/**
 * US-202 — 프로젝트 멤버 관리.
 * 보드에서 연다. 여기가 "이 프로젝트에 누가 있는가" 를 이미 보고 있는 곳이고,
 * 사람을 더해야겠다는 생각도 보드를 보다가 생긴다.
 */
export function MembersDialog({
  projectId,
  canManage,
  onClose,
}: {
  projectId: string
  canManage: boolean
  onClose: () => void
}) {
  const { userId } = useSession()
  const { data: members, isPending } = useProjectMembers(projectId)
  const { data: wsMembers } = useWorkspaceMembers()
  const add = useAddProjectMember(projectId)
  const [removing, setRemoving] = useState<BoardMember | null>(null)

  const inProject = new Set((members ?? []).map((m) => m.user_id))
  const candidates = (wsMembers ?? []).filter((m) => !inProject.has(m.user_id))
  const leads = (members ?? []).filter((m) => m.role === 'lead').length

  return (
    <>
      <div className="fixed inset-0 z-60 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-70 flex max-h-[80vh] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border-strong bg-bg">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">프로젝트 멤버</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isPending ? (
            <Spinner />
          ) : (
            <ul className="flex flex-col gap-3">
              {members?.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3">
                  <Avatar name={m.name} />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {m.name}
                    {m.user_id === userId && <span className="ml-1 text-fg-subtle">(나)</span>}
                  </span>

                  {canManage && !(m.role === 'lead' && leads <= 1) ? (
                    <RolePicker projectId={projectId} member={m} />
                  ) : (
                    <span className="shrink-0 text-badge text-fg-muted">
                      {m.role === 'lead' ? 'Lead' : 'Member'}
                    </span>
                  )}

                  {canManage && !(m.role === 'lead' && leads <= 1) && (
                    <button
                      className="shrink-0 text-badge text-fg-subtle hover:text-danger"
                      onClick={() => setRemoving(m)}
                    >
                      제외
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold text-fg-muted">워크스페이스 멤버 추가</p>
              {candidates.length ? (
                <ul className="flex flex-col gap-2">
                  {candidates.map((c) => (
                    <li key={c.user_id} className="flex items-center gap-3">
                      <Avatar name={c.name} url={c.avatar_url} size={24} />
                      <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{c.name}</span>
                      <Button
                        className="shrink-0 px-2.5 py-1 text-badge"
                        disabled={add.isPending}
                        onClick={() => add.mutate({ userId: c.user_id, role: 'member' })}
                      >
                        <Plus size={13} strokeWidth={2} />
                        추가
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-fg-subtle">
                  워크스페이스 멤버가 모두 이 프로젝트에 있어요.
                  <br />새 사람은 설정에서 초대해주세요.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {removing && (
        <RemoveMemberDialog
          projectId={projectId}
          member={removing}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}

/** 마지막 Lead 는 강등할 수 없다 (AC-4). 호출부가 이미 걸러내고, 서버도 막는다 */
function RolePicker({ projectId, member }: { projectId: string; member: BoardMember }) {
  const setRole = useSetProjectRole(projectId)
  return (
    <select
      value={member.role}
      disabled={setRole.isPending}
      onChange={(e) =>
        setRole.mutate({ userId: member.user_id, role: e.target.value as ProjectRole })
      }
      className="shrink-0 rounded-md border border-border bg-bg px-2 py-1 text-badge text-fg-muted focus:border-primary focus:outline-none"
    >
      <option value="member">Member</option>
      <option value="lead">Lead</option>
    </select>
  )
}

/** US-202 AC-5 — 무엇이 미배정으로 돌아가는지 먼저 보여준다 */
function RemoveMemberDialog({
  projectId,
  member,
  onClose,
}: {
  projectId: string
  member: BoardMember
  onClose: () => void
}) {
  const { data: affected, isPending } = useRemovalPreview(projectId, member.user_id)
  const remove = useRemoveProjectMember(projectId)

  return (
    <>
      <div className="fixed inset-0 z-80 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-90 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-bg p-5">
        <h3 className="text-base font-semibold">{member.name}님을 프로젝트에서 제외할까요?</h3>

        {isPending ? (
          <Spinner />
        ) : affected?.length ? (
          <>
            <p className="mt-2 text-xs text-fg-muted">
              담당하던 <b className="text-fg">{affected.length}건</b>이 미배정으로 돌아갑니다.
              진행 상태는 그대로 두므로 어디까지 됐는지는 남아요.
            </p>
            <ul className="mt-3 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
              {affected.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs">
                  <StatusBadge status={t.status} />
                  <span className="truncate">{t.title}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-fg-muted">담당 중인 미완료 업무는 없어요.</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate(member.user_id, { onSuccess: onClose })}
          >
            제외
          </Button>
        </div>
      </div>
    </>
  )
}
