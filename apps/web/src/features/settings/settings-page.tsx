import { useRef, useState } from 'react'
import { UserPlus, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, type WorkspaceRole } from '@/lib/supabase'
import { parseDbError } from '@/lib/errors'
import { resizeToWebp } from '@/lib/image'
import { useMe, useSession } from '@/features/auth/session'
import { InviteDialog } from '@/features/invite/invite-dialog'
import { inviteUrl } from '@/features/invite/token'
import { PushSettings } from '@/features/notifications/push-settings'
import { Avatar } from '@/components/avatar'
import { Button, Card, Input, Spinner } from '@/components/ui'
import {
  useWorkspaceMembers,
  useRemovalImpact,
  useSetMemberRole,
  useRemoveMember,
  usePendingInvites,
  useCancelInvite,
  useUpdateProfile,
  type WsMember,
} from './use-settings'

/**
 * US-1001 — 워크스페이스 · 멤버 설정 (+ US-104 프로필, US-802 알림).
 *
 * 탭으로 쪼개지 않는다. 설정에 오는 빈도는 낮고, 올 때는 대개
 * "누가 있더라 / 내 이름 바꾸자" 같은 짧은 일이다 — 한 화면에서 끝나야 한다.
 */
export function SettingsPage() {
  const { data: me } = useMe()

  return (
    <div className="px-4 py-6 md:px-6">
      <h1 className="text-xl font-semibold">설정</h1>

      <div className="mt-4 flex max-w-2xl flex-col gap-6">
        <ProfileSection />
        <PushSettings />
        <MembersSection isAdmin={!!me?.isWorkspaceAdmin} />
        {me?.isWorkspaceAdmin && <InvitesSection />}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold text-fg-muted">{title}</h2>
      <Card className="p-4">{children}</Card>
    </section>
  )
}

/** US-104. 이메일은 계정 식별자라 읽기 전용이다 (AC-3) */
function ProfileSection() {
  const { data: me } = useMe()
  const { userId } = useSession()
  const update = useUpdateProfile()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const profile = me?.profile
  const value = name ?? profile?.name ?? ''
  const dirty = value.trim() !== (profile?.name ?? '') && !!value.trim()

  async function onPick(file: File) {
    setUploading(true)
    try {
      const blob = await resizeToWebp(file)
      const path = `${userId}/avatar.webp` // 경로 규약 (08_storage.sql)
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/webp', upsert: true })
      if (error) throw error

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // 같은 경로에 덮어쓰므로 URL 이 변하지 않는다 — 캐시를 깨야 새 사진이 보인다
      update.mutate({ avatar_url: `${data.publicUrl}?v=${Date.now()}` })
    } catch (e) {
      toast.error(parseDbError(e).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Section title="프로필">
      <div className="flex items-center gap-4">
        <Avatar name={profile?.name ?? ''} url={profile?.avatar_url} size={56} />
        <div className="flex flex-col gap-1.5">
          <Button
            className="px-3 py-1.5 text-xs"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? '올리는 중' : '사진 바꾸기'}
          </Button>
          {profile?.avatar_url && (
            <button
              className="text-badge text-fg-subtle hover:text-danger"
              onClick={() => update.mutate({ avatar_url: null })}
            >
              사진 지우기
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onPick(f)
            e.target.value = '' // 같은 파일을 다시 골라도 change 가 뜨게
          }}
        />
      </div>

      <label className="mt-4 block text-xs text-fg-muted">이름</label>
      <div className="mt-1 flex gap-2">
        <Input
          value={value}
          maxLength={40}
          className="text-xs"
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          variant="primary"
          className="shrink-0 px-3 py-1.5 text-xs"
          disabled={!dirty || update.isPending}
          onClick={() => update.mutate({ name: value.trim() }, { onSuccess: () => setName(null) })}
        >
          저장
        </Button>
      </div>

      <p className="mt-3 text-badge text-fg-subtle">{profile?.email} · 이메일은 바꿀 수 없어요</p>
    </Section>
  )
}

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: '소유자',
  admin: '관리자',
  member: '멤버',
}

function MembersSection({ isAdmin }: { isAdmin: boolean }) {
  const { userId } = useSession()
  const { data: members, isPending } = useWorkspaceMembers()
  const [removing, setRemoving] = useState<WsMember | null>(null)
  const [inviting, setInviting] = useState(false)

  const owners = (members ?? []).filter((m) => m.role === 'owner').length

  return (
    <Section title={`멤버 ${members?.length ?? 0}`}>
      {isPending ? (
        <Spinner />
      ) : (
        <ul className="flex flex-col gap-3">
          {members?.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3">
              <Avatar name={m.name} url={m.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {m.name}
                  {m.user_id === userId && <span className="ml-1 text-fg-subtle">(나)</span>}
                </p>
                <p className="truncate text-badge text-fg-subtle">
                  {m.email}
                  {isAdmin && ` · 프로젝트 ${m.projects}`}
                </p>
              </div>

              <MemberRole member={m} isAdmin={isAdmin} lastOwner={m.role === 'owner' && owners <= 1} />

              {isAdmin && m.user_id !== userId && !(m.role === 'owner' && owners <= 1) && (
                <button
                  className="shrink-0 text-badge text-fg-subtle hover:text-danger"
                  onClick={() => setRemoving(m)}
                >
                  제거
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <Button className="mt-4 px-3 py-1.5 text-xs" onClick={() => setInviting(true)}>
          <UserPlus size={14} strokeWidth={1.75} />
          팀원 초대
        </Button>
      )}

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      {removing && <RemoveDialog member={removing} onClose={() => setRemoving(null)} />}
    </Section>
  )
}

/** 마지막 Owner 는 강등할 수 없다 (AC-3). 서버도 tg_guard_last_owner 로 막는다 */
function MemberRole({
  member,
  isAdmin,
  lastOwner,
}: {
  member: WsMember
  isAdmin: boolean
  lastOwner: boolean
}) {
  const setRole = useSetMemberRole()

  if (!isAdmin || lastOwner) {
    return <span className="shrink-0 text-badge text-fg-muted">{ROLE_LABEL[member.role]}</span>
  }

  return (
    <select
      value={member.role}
      disabled={setRole.isPending}
      onChange={(e) => setRole.mutate({ userId: member.user_id, role: e.target.value as WorkspaceRole })}
      className="shrink-0 rounded-md border border-border bg-bg px-2 py-1 text-badge text-fg-muted focus:border-primary focus:outline-none"
    >
      {(['member', 'admin', 'owner'] as const).map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  )
}

/** 제거 전에 영향을 먼저 보여준다 (AC-4) */
function RemoveDialog({ member, onClose }: { member: WsMember; onClose: () => void }) {
  const { data: impact, isPending } = useRemovalImpact(member.user_id)
  const remove = useRemoveMember()

  return (
    <>
      <div className="fixed inset-0 z-60 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-70 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-bg p-5">
        <h3 className="text-base font-semibold">{member.name}님을 제거할까요?</h3>
        {isPending ? (
          <Spinner />
        ) : (
          <p className="mt-2 text-xs text-fg-muted">
            {impact ? (
              <>
                담당하던 미완료 업무 <b className="text-fg">{impact}건</b>이 미배정으로 돌아가고, 각
                프로젝트 Lead에게 알림이 갑니다.
              </>
            ) : (
              '담당 중인 미완료 업무는 없어요.'
            )}
            <br />
            완료된 업무의 담당자는 기록이므로 그대로 둡니다. 개인 업무는 함께 삭제돼요.
          </p>
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
            제거
          </Button>
        </div>
      </div>
    </>
  )
}

/** 대기 중 초대 (AC-2). 링크 방식이므로 다시 복사할 수 있어야 한다 */
function InvitesSection() {
  const { data: invites, isPending } = usePendingInvites()
  const cancel = useCancelInvite()
  const [copied, setCopied] = useState<string | null>(null)

  if (isPending) return null
  if (!invites?.length) return null

  return (
    <Section title={`대기 중 초대 ${invites.length}`}>
      <ul className="flex flex-col gap-3">
        {invites.map((v) => {
          const expired = new Date(v.expires_at) < new Date()
          const project = (v.projects as unknown as { name: string } | null)?.name
          return (
            <li key={v.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs">{v.email}</p>
                <p className="truncate text-badge text-fg-subtle">
                  {project ? `${project} · ` : ''}
                  {expired ? '만료됨' : '수락 대기'}
                </p>
              </div>
              {!expired && (
                <button
                  className="shrink-0 text-badge text-fg-subtle hover:text-fg"
                  onClick={async () => {
                    await navigator.clipboard.writeText(inviteUrl(v.token))
                    setCopied(v.id)
                    setTimeout(() => setCopied(null), 2000)
                  }}
                >
                  {copied === v.id ? (
                    <Check size={14} strokeWidth={2} className="text-status-done" />
                  ) : (
                    <Copy size={14} strokeWidth={1.75} />
                  )}
                </button>
              )}
              <button
                className="shrink-0 text-badge text-fg-subtle hover:text-danger"
                onClick={() => cancel.mutate(v.id)}
              >
                취소
              </button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
