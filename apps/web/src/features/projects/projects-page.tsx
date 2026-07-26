import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Lock, FolderPlus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { parseDbError } from '@/lib/errors'
import { useMe } from '@/features/auth/session'
import { useProjects } from './use-projects'
import { InviteDialog } from '@/features/invite/invite-dialog'
import { Button, Card, EmptyState, Input, Spinner, Badge } from '@/components/ui'

/** US-201 · US-203. 목록 단계에서 이미 "어디를 봐야 하는지"가 보여야 한다 */
export function ProjectsPage() {
  const { data: me } = useMe()
  const [creating, setCreating] = useState(false)
  const [inviting, setInviting] = useState(false)

  const { data, isPending } = useProjects()

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
            <Button variant="primary" onClick={() => setCreating((v) => !v)}>
              <Plus size={18} strokeWidth={1.75} />새 프로젝트
            </Button>
          </div>
        )}
      </div>

      {inviting && <InviteDialog onClose={() => setInviting(false)} />}

      {creating && <CreateProjectForm onDone={() => setCreating(false)} />}

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
        {data?.map((s) => {
          const progress = Number(s.progress ?? 0)
          return (
            <Link key={s.project_id} to={`/projects/${s.project_id}/board`}>
              <Card className="px-4 py-3 transition-colors hover:bg-bg-subtle">
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
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/** 필수 입력은 이름 하나뿐 (US-201 AC-2). 폼이 길면 프로젝트를 안 만들고 개인 업무에 몰아넣는다 */
function CreateProjectForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const mut = useMutation({
    mutationFn: async (n: string) => {
      // D-045: insert().select() 는 RLS 때문에 실패한다. RPC 를 쓴다
      const { data, error } = await supabase.rpc('create_project', { p_name: n })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects() })
      setName('')
      onDone()
    },
    onError: (e) => toast.error(parseDbError(e).message),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) mut.mutate(name.trim())
  }

  return (
    <Card className="mt-4 p-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <Input
          autoFocus
          maxLength={60}
          placeholder="프로젝트 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={!name.trim() || mut.isPending}>
            만들기
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            취소
          </Button>
        </div>
      </form>
    </Card>
  )
}
