import { Link, useNavigate, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase, type EnrichedTask } from '@/lib/supabase'
import { qk } from '@/lib/query'
import { useSession, useMe } from '@/features/auth/session'
import { useProjects } from '@/features/projects/use-projects'
import { InstallHint } from '@/features/onboarding/install-hint'
import { StatusDot } from '@/components/status'
import { Card, EmptyState, Spinner, Button, Badge } from '@/components/ui'
import { dueLabel, dueWithWeekday, toDateStr } from '@/lib/date'
import { FolderPlus } from 'lucide-react'

/**
 * US-701. 기본 탭은 `내 업무` — 역할과 무관하다.
 * Lead 도 실무를 하기 때문이다 (D-004).
 * `전체` 탭은 M3 다.
 */
export function DashboardPage() {
  const { userId } = useSession()
  const { data: me } = useMe()
  const nav = useNavigate()
  const loc = useLocation()

  const mine = useQuery({
    queryKey: [...qk.myTasks(), 'dashboard'],
    enabled: !!userId,
    queryFn: async (): Promise<EnrichedTask[]> => {
      const { data, error } = await supabase
        .from('v_tasks_enriched')
        .select('*')
        .eq('assignee_id', userId!)
        .neq('status', 'done')
        .order('due_date', { nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })

  const projects = useProjects()

  if (mine.isPending) return <Spinner />

  const today = new Date().toISOString().slice(0, 10)
  const todayTasks = (mine.data ?? []).filter(
    (t) => (t.due_date && t.due_date <= today) || t.status === 'in_progress',
  )
  const inProgress = (mine.data ?? []).filter((t) => t.status === 'in_progress')
  /**
   * 이번주 마감 (US-701 AC-2).
   * `오늘 할 일` 과 겹치지 않게 **내일부터** 이번 주 일요일까지만 본다 —
   * 같은 카드가 두 위젯에 동시에 뜨면 건수가 부풀어 보인다.
   */
  const weekEnd = endOfThisWeek()
  const thisWeek = (mine.data ?? []).filter(
    (t) => t.due_date && t.due_date > today && t.due_date <= weekEnd,
  )
  const open = (id: string) => nav(`/tasks/${id}`, { state: { backgroundLocation: loc } })

  /**
   * 소속 프로젝트가 0개면 대시보드 대신 안내 (US-103 AC-1).
   *
   * ⚠️ `개인 업무` 를 빼고 센다. 워크스페이스에 합류하면 누구에게나 개인 업무
   * 프로젝트가 자동 생성되므로(마이그레이션 17) 목록이 0이 되는 일이 없다 —
   * 이 분기는 여태 한 번도 실행되지 않았다. 여기서 묻는 것은
   * "팀의 일이 하나라도 있는가" 다.
   */
  const teamProjects = (projects.data ?? []).filter((p) => !p.is_personal)
  if (teamProjects.length === 0) {
    return (
      <div className="px-4 py-6 md:px-6">
        <InstallHint />
        <Card>
          <EmptyState
            icon={<FolderPlus size={32} strokeWidth={1.5} />}
            title={me?.isWorkspaceAdmin ? '첫 프로젝트를 만들어보세요' : '아직 참여 중인 프로젝트가 없어요'}
            description={me?.isWorkspaceAdmin ? undefined : '관리자에게 프로젝트 참여를 요청하세요'}
            action={
              me?.isWorkspaceAdmin ? (
                <Link to="/projects">
                  <Button variant="primary">프로젝트 만들기</Button>
                </Link>
              ) : (
                // 팀 프로젝트가 없어도 개인 업무는 있다 — 갈 곳 없이 세워두지 않는다
                <Link to="/tasks">
                  <Button>개인 업무 보기</Button>
                </Link>
              )
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <InstallHint />
      <h1 className="hidden text-xl font-semibold md:block">대시보드</h1>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Widget title="오늘 할 일" count={todayTasks.length}>
          {todayTasks.length ? (
            todayTasks.slice(0, 6).map((t) => (
              <Row key={t.id} task={t} onClick={() => open(t.id!)} />
            ))
          ) : (
            <EmptyState
              title="오늘 할 일이 없어요"
              action={
                <Link to="/tasks">
                  <Button>내 업무 보기</Button>
                </Link>
              }
            />
          )}
        </Widget>

        <Widget title="내 진행중 업무" count={inProgress.length}>
          {inProgress.length ? (
            inProgress.map((t) => <Row key={t.id} task={t} onClick={() => open(t.id!)} />)
          ) : (
            <EmptyState title="진행중인 업무가 없어요" achieved />
          )}
        </Widget>

        <Widget title="이번주 마감" count={thisWeek.length}>
          {thisWeek.length ? (
            thisWeek.map((t) => (
              <Row key={t.id} task={t} weekday onClick={() => open(t.id!)} />
            ))
          ) : (
            <EmptyState title="이번주에 마감인 업무가 없어요" achieved />
          )}
        </Widget>

        <Widget title="내 프로젝트" count={projects.data?.length ?? 0}>
          {(projects.data ?? []).map((s) => (
            <Link
              key={s.project_id}
              to={`/projects/${s.project_id}/board`}
              className="flex items-center gap-3 border-b border-border py-2 last:border-0 hover:bg-bg-subtle"
            >
              <span className="flex-1 truncate text-xs">{s.name}</span>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-bg-sunken">
                <div className="h-full bg-primary" style={{ width: `${Number(s.progress ?? 0)}%` }} />
              </div>
              <span className="num text-xs">{Number(s.progress ?? 0)}%</span>
            </Link>
          ))}
        </Widget>
      </div>
    </div>
  )
}

function Widget({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="num text-xs text-fg-muted">{count}</span>
      </div>
      <div className="mt-1">{children}</div>
    </Card>
  )
}

function Row({
  task,
  weekday,
  onClick,
}: {
  task: EnrichedTask
  /** 이번주 마감에서는 D-2 보다 "수 7/30" 이 유용하다 — 요일에 일정이 걸려 있다 */
  weekday?: boolean
  onClick: () => void
}) {
  const d = dueLabel(task.due_date)
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 border-b border-border py-2 text-left last:border-0 hover:bg-bg-subtle"
    >
      {task.status && <StatusDot status={task.status} size="sm" />}
      <span className="flex-1 truncate text-xs">{task.title}</span>
      {weekday && task.due_date && (
        <span className="num shrink-0 text-badge text-fg-muted">
          {dueWithWeekday(task.due_date)}
        </span>
      )}
      {d && (
        <Badge mono tone={task.is_overdue ? 'danger' : 'neutral'}>
          {d}
        </Badge>
      )}
    </button>
  )
}

/** 이번 주의 일요일 (YYYY-MM-DD). 주가 일요일에 끝난다는 전제는 date-fns 기본과 같다 */
function endOfThisWeek(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + (7 - d.getDay()) % 7)
  return toDateStr(d)
}
