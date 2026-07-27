import { useState } from 'react'
import { useSession } from '@/features/auth/session'
import { useProjectMembers, type BoardMember } from '@/features/board/use-board'
import { Spinner } from '@/components/ui'
import { STATUS_LABEL } from '@/components/status'
import { relativeTime, dueShort } from '@/lib/date'
import { useComments, useAddComment, extractMentions, type Comment } from './use-comments'
import { useActivities, type Activity } from './use-activities'
import { CommentItem, MentionInput } from './comments'

/**
 * US-602 + US-603 — 하나의 타임라인.
 *
 * 활동 로그를 별도 탭으로 빼지 않는다 (US-603 AC-1).
 * "누가 반려했는지" 와 "왜 반려했는지" 가 다른 화면에 있으면
 * 둘을 잇는 일은 결국 사람이 하게 된다.
 */

function nameOf(id: string | null | undefined, members: BoardMember[]): string {
  if (!id) return ''
  // 프로젝트를 떠난 사람의 이름은 남아 있지 않다 — 이름이 사라져도 사건은 남는다
  return members.find((m) => m.user_id === id)?.name ?? '알 수 없음'
}

/** 누가·무엇을 (US-603 AC-3). 주어는 호출부가 붙인다 */
function activityText(a: Activity, members: BoardMember[]): string | null {
  const to = a.payload?.to ?? null
  const from = a.payload?.from ?? null

  switch (a.type) {
    case 'created':
      return '업무를 만들었어요'
    case 'assigned':
      // 스스로 가져간 것(US-403)과 남에게 배정한 것은 다른 사건이다
      return to === a.user_id
        ? '업무를 가져갔어요'
        : `담당자를 ${nameOf(to, members)}님으로 바꿨어요`
    case 'unassigned':
      return `담당자를 비웠어요 (${nameOf(from, members)}님)`
    case 'status_changed': {
      if (!STATUS_LABEL[to as keyof typeof STATUS_LABEL]) return null
      if (to === 'done') return '완료로 확정했어요'
      // in_review 로 올린 것이 곧 리뷰 요청이다 (US-502)
      if (to === 'in_review') return '리뷰를 요청했어요'
      if (to === 'in_progress') return from === 'in_review' ? '반려했어요' : '업무를 시작했어요'
      if (to === 'todo') return '예정으로 되돌렸어요'
      return null
    }
    case 'due_changed':
      return to
        ? `마감일을 ${dueShort(to)?.replace('~', '') ?? to}로 ${from ? '바꿨어요' : '정했어요'}`
        : '마감일을 지웠어요'
    case 'completed':
      return '완료로 확정했어요'
    case 'rejected':
      return '반려했어요'
    case 'deleted':
      return '업무를 삭제했어요'
    case 'restored':
      return '업무를 되살렸어요'
    default:
      return null
  }
}

function ActivityLine({ a, members }: { a: Activity; members: BoardMember[] }) {
  const text = activityText(a, members)
  if (!text) return null

  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5 text-badge text-fg-subtle">
      <span className="font-medium text-fg-muted">{a.actor?.name ?? '알 수 없음'}님이</span>
      <span>{text}</span>
      {/* D-016d: 관리자 권한으로 남의 프로젝트에 개입한 경우 숨기지 않는다 */}
      {a.via_admin && <span className="text-fg-subtle">(관리자 권한)</span>}
      <span>· {relativeTime(a.created_at)}</span>
    </li>
  )
}

type Entry =
  | { kind: 'comment'; at: string; comment: Comment }
  | { kind: 'activity'; at: string; activity: Activity }

export function TimelineSection({
  taskId,
  projectId,
  canLead,
}: {
  taskId: string
  projectId: string | null
  canLead: boolean
}) {
  const { userId } = useSession()
  const { data: comments, isPending: loadingComments } = useComments(taskId)
  const { data: activities, isPending: loadingActivities } = useActivities(taskId)
  const { data: members = [] } = useProjectMembers(projectId ?? '')
  const add = useAddComment(taskId)
  const [showAll, setShowAll] = useState(false)

  const entries: Entry[] = [
    ...(comments ?? []).map((c): Entry => ({ kind: 'comment', at: c.created_at, comment: c })),
    ...(activities ?? []).map((a): Entry => ({ kind: 'activity', at: a.created_at, activity: a })),
  ].sort((x, y) => x.at.localeCompare(y.at))

  // 오래된 업무는 활동이 수십 줄이 된다. 최근 것부터 보이게 하고 나머지는 접는다
  const LIMIT = 12
  const hidden = Math.max(0, entries.length - LIMIT)
  const shown = showAll ? entries : entries.slice(-LIMIT)

  return (
    <section className="border-t border-border pt-3">
      <h3 className="mb-3 text-xs font-semibold text-fg-muted">
        기록{comments?.length ? ` · 댓글 ${comments.length}` : ''}
      </h3>

      {loadingComments || loadingActivities ? (
        <Spinner />
      ) : (
        <>
          {!!hidden && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="mb-3 text-badge text-fg-subtle hover:text-fg"
            >
              이전 기록 {hidden}개 더 보기
            </button>
          )}

          <ul className="mb-4 flex flex-col gap-3">
            {shown.map((e) =>
              e.kind === 'comment' ? (
                <CommentItem
                  key={`c${e.comment.id}`}
                  comment={e.comment}
                  members={members}
                  canLead={canLead}
                  taskId={taskId}
                  isMine={e.comment.user_id === userId}
                />
              ) : (
                <ActivityLine key={`a${e.activity.id}`} a={e.activity} members={members} />
              ),
            )}
          </ul>
        </>
      )}

      <MentionInput
        members={members}
        busy={add.isPending}
        placeholder="댓글 쓰기 · @이름 으로 멘션"
        onSubmit={(body) => add.mutate({ body, mentions: extractMentions(body, members) })}
      />
    </section>
  )
}
