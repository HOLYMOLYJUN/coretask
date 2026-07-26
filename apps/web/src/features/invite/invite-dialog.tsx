import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Copy, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { parseDbError } from '@/lib/errors'
import { useMe } from '@/features/auth/session'
import { useProjects } from '@/features/projects/use-projects'
import { Button, Input } from '@/components/ui'
import { inviteUrl } from './token'

/**
 * US-102 — 초대 만들기
 *
 * M1 은 링크 복사 방식이다. 이메일 발송(Edge Function)은 M2 다 (API §5.1).
 * 링크를 만들어 카톡·슬랙으로 보내면 초대 자체는 지금 완결된다.
 *
 * D-033: 프로젝트를 함께 지정한다.
 * 워크스페이스 합류와 프로젝트 배치가 두 단계로 나뉘면 두 번째가 잊히고,
 * 초대받은 사람은 빈 대시보드를 보고 이탈한다 (User Flow §2 F0-B).
 */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const { data: me } = useMe()
  const { data: projects = [] } = useProjects()
  const [email, setEmail] = useState('')
  const [projectId, setProjectId] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const real = projects.filter((p) => !p.is_personal)

  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          workspace_id: me!.workspaceId!,
          email: email.trim().toLowerCase(),
          role: 'member',
          project_id: projectId || null,
          invited_by: me!.profile!.id,
        })
        .select('token')
        .single()
      if (error) throw error
      return data.token
    },
    onSuccess: (token) => setLink(inviteUrl(token)),
    onError: (e) => toast.error(parseDbError(e).message),
  })

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (email.trim()) mut.mutate()
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(15,23,42,.32)]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-bg p-5">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">팀원 초대</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1 text-fg-muted hover:bg-bg-subtle hover:text-fg"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {link ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-fg-muted">
              링크를 복사해 전달하세요. <b className="text-fg">7일 후 만료</b>됩니다.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2">
              <span className="flex-1 truncate text-xs">{link}</span>
              <button
                onClick={copy}
                className="shrink-0 rounded-md p-1.5 text-fg-muted hover:bg-bg hover:text-fg"
                aria-label="링크 복사"
              >
                {copied ? (
                  <Check size={16} strokeWidth={2} className="text-primary" />
                ) : (
                  <Copy size={16} strokeWidth={1.75} />
                )}
              </button>
            </div>
            <Button variant="primary" onClick={onClose}>
              완료
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-fg-muted">이메일</span>
              <Input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-fg-muted">참여할 프로젝트</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded-md border border-border bg-bg px-3 py-2 text-base"
              >
                <option value="">선택 안 함</option>
                {real.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {!projectId && (
                <span className="text-badge text-status-delayed">
                  프로젝트를 고르지 않으면 합류 후 빈 화면을 보게 됩니다
                </span>
              )}
            </label>

            <Button type="submit" variant="primary" disabled={mut.isPending || !email.trim()}>
              {mut.isPending ? '만드는 중' : '초대 링크 만들기'}
            </Button>
          </form>
        )}
      </div>
    </>
  )
}
