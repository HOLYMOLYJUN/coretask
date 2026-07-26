/**
 * core_task — RLS 검증 스크립트
 * 근거: docs/07-SETUP.md Part 6-2
 *
 * 앱 코드를 짜기 전에 이걸 먼저 통과시킨다.
 * 나중에 확인하면 이미 실사용 데이터가 들어가 있다.
 *
 * SQL Editor 에서 슈퍼유저로 확인하지 않는 이유:
 * 실제 사용자는 PostgREST + anon 키 + RLS 를 통과해서 들어온다.
 * 검증도 같은 경로로 해야 의미가 있다.
 *
 *   node scripts/verify-rls.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// apps/web/.env.local 에서 직접 읽는다 (단일 진실)
const env = Object.fromEntries(
  readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

const stamp = Date.now()
const ALICE = { email: `alice${stamp}@example.com`, password: 'test1234!' }
const BOB = { email: `bob${stamp}@example.com`, password: 'test1234!' }

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? `\n     → ${detail}` : ''}`)
  }
}
const errCode = (e) => (e?.message ?? '').split(':')[0].trim()

async function signUp(cred) {
  const c = createClient(URL_, KEY, opts)
  const { data, error } = await c.auth.signUp(cred)
  if (error) throw new Error(`signUp 실패: ${error.message}`)
  if (!data.session) {
    throw new Error(
      'signUp 은 됐는데 세션이 없다. Authentication > Email > "Confirm email" 이 켜져 있다.\n' +
        '   → SETUP §3-1 대로 개발 중에는 끈다.',
    )
  }
  return c
}

console.log(`\ncore_task RLS 검증  ·  ${URL_}\n`)

// ── 1. 계정 생성 ─────────────────────────────────────────────
console.log('1. 계정 2개 생성')
const alice = await signUp(ALICE)
const bob = await signUp(BOB)
const aliceId = (await alice.auth.getUser()).data.user.id
const bobId = (await bob.auth.getUser()).data.user.id
check('가입 + 세션 발급', !!aliceId && !!bobId)

// profiles 자동 생성 트리거 (03_authz.sql)
{
  const { data } = await alice.from('profiles').select('id, name').eq('id', aliceId).single()
  check('가입 시 profiles 행 자동 생성', !!data, data ? '' : 'tg_handle_new_user 트리거 확인')
}

// ── 2. 워크스페이스 부트스트랩 ────────────────────────────────
console.log('\n2. 워크스페이스 생성 (RPC)')
const { data: wsId, error: wsErr } = await alice.rpc('create_workspace', { p_name: '테스트 회사' })
check('create_workspace', !!wsId, wsErr?.message)

{
  const { data } = await alice.from('projects').select('id, name, is_personal')
  check(
    '`개인 업무` 프로젝트 자동 생성 (D-023)',
    data?.length === 1 && data[0].is_personal && data[0].name === '개인 업무',
    JSON.stringify(data),
  )
}
{
  const { data } = await alice.from('memberships').select('role').eq('user_id', aliceId).single()
  check('생성자가 Owner (D-016e)', data?.role === 'owner', JSON.stringify(data))
}
{
  const { error } = await alice.rpc('create_workspace', { p_name: '두 번째' })
  check('1인 1워크스페이스 강제 (D-022)', errCode(error) === 'ALREADY_IN_WORKSPACE', error?.message)
}

// ── 3. 프로젝트 · Task ───────────────────────────────────────
console.log('\n3. 프로젝트 · Task')
const { data: proj, error: pErr } = await alice.rpc('create_project', { p_name: 'Alice 프로젝트' })
check('프로젝트 생성 (create_project RPC)', !!proj?.id, pErr?.message)
{
  const { error } = await bob.rpc('create_project', { p_name: 'Bob 프로젝트' })
  check('WS Admin 아니면 프로젝트 생성 불가', errCode(error) === 'NO_WORKSPACE' || errCode(error) === 'FORBIDDEN', error?.message)
}

{
  const { data } = await alice
    .from('project_members')
    .select('role')
    .eq('project_id', proj.id)
    .eq('user_id', aliceId)
    .single()
  check('생성자가 자동 Lead (D-016e)', data?.role === 'lead', JSON.stringify(data))
}

const { data: task, error: tErr } = await alice
  .from('tasks')
  .insert({ project_id: proj.id, title: '로그인 API 연동', created_by: aliceId })
  .select()
  .single()
check('Task 생성', !!task, tErr?.message)
check('생성 시 status = todo (D-018)', task?.status === 'todo', task?.status)
check('미배정 = assignee_id NULL (D-018)', task?.assignee_id === null)

// ── 4. 🔴 격리 — 가장 중요한 검증 ─────────────────────────────
console.log('\n4. 🔴 워크스페이스 격리 (SETUP §6-2 핵심)')
{
  const { data } = await bob.from('projects').select('id')
  check('Bob 에게 Alice 프로젝트가 보이지 않는다', data?.length === 0, `보인 개수: ${data?.length}`)
}
{
  const { data } = await bob.from('tasks').select('id')
  check('Bob 에게 Alice Task 가 보이지 않는다', data?.length === 0, `보인 개수: ${data?.length}`)
}
{
  const { data, error } = await bob.from('tasks').select('*').eq('id', task.id).maybeSingle()
  check('직접 ID 조회도 차단 (404 로 다뤄야 함, D-032)', !data && !error, JSON.stringify({ data, error }))
}
{
  const { error } = await bob
    .from('tasks')
    .insert({ project_id: proj.id, title: '침입', created_by: bobId })
  check('Bob 이 남의 프로젝트에 Task 생성 불가', !!error, error ? '' : '생성돼버렸다')
}

// ── 5. 상태 전이 규칙 ────────────────────────────────────────
console.log('\n5. 상태 전이 (PRD §6 상태 전이표)')
{
  const { error } = await alice.from('tasks').update({ status: 'in_review' }).eq('id', task.id)
  check('todo → in_review 금지', errCode(error) === 'INVALID_TRANSITION', error?.message)
}
{
  const { error } = await alice.from('tasks').update({ status: 'in_progress' }).eq('id', task.id)
  check('todo → in_progress 허용', !error, error?.message)
}
{
  const { data } = await alice.from('tasks').select('start_date').eq('id', task.id).single()
  check('start_date 자동 기록 (D-021c)', !!data?.start_date, JSON.stringify(data))
}

// 팀원(Bob)을 프로젝트에 넣고 권한 테스트
await alice.from('project_members').insert({ project_id: proj.id, user_id: bobId, role: 'member' })
await alice.from('tasks').update({ assignee_id: bobId, due_date: '2026-08-30' }).eq('id', task.id)

{
  const { data } = await bob.from('tasks').select('id')
  check('프로젝트 합류 후 Bob 에게 Task 가 보인다', data?.length === 1, `개수: ${data?.length}`)
}
{
  const { error } = await bob.from('tasks').update({ status: 'done' }).eq('id', task.id)
  check(
    '🔴 팀원은 done 으로 못 옮긴다 (D-007)',
    errCode(error) === 'INVALID_TRANSITION' || errCode(error) === 'FORBIDDEN',
    error?.message ?? '옮겨져버렸다',
  )
}
{
  const { error } = await bob.from('tasks').update({ status: 'in_review' }).eq('id', task.id)
  check('팀원은 in_review 까지 가능 (US-502)', !error, error?.message)
}
{
  const { error } = await alice.from('tasks').update({ status: 'done' }).eq('id', task.id)
  check('Lead 는 완료 확정 가능', !error, error?.message)
}
{
  const { data } = await alice.from('tasks').select('completed_at').eq('id', task.id).single()
  check('completed_at 기록', !!data?.completed_at)
}

// ── 6. 배정 규칙 ─────────────────────────────────────────────
console.log('\n6. 배정 · 가져가기')
const { data: t2 } = await alice
  .from('tasks')
  .insert({ project_id: proj.id, title: '미배정 업무', created_by: aliceId })
  .select()
  .single()
{
  const { error } = await bob.rpc('claim_task', { p_task: t2.id, p_due: null })
  check('가져갈 때 마감일 필수 (US-403 AC-5)', errCode(error) === 'DUE_REQUIRED', error?.message)
}
{
  const { error } = await bob.rpc('claim_task', { p_task: t2.id, p_due: '2026-08-15' })
  check('미배정 업무 가져가기 성공 (US-403)', !error, error?.message)
}
{
  const { error } = await bob.rpc('claim_task', { p_task: t2.id, p_due: '2026-08-15' })
  check('이미 배정된 업무는 못 가져간다 (EC-7)', errCode(error) === 'ALREADY_ASSIGNED', error?.message)
}
{
  const { data: t3 } = await alice
    .from('tasks')
    .insert({ project_id: proj.id, title: '남의 것', created_by: aliceId, assignee_id: aliceId })
    .select()
    .single()
  const { error } = await bob.from('tasks').update({ assignee_id: bobId }).eq('id', t3.id)
  check('팀원이 남의 업무를 뺏을 수 없다 (EC-7)', errCode(error) === 'FORBIDDEN', error?.message)
}

// ── 7. 마지막 Lead 보호 ──────────────────────────────────────
console.log('\n7. 불변식')
{
  const { error } = await alice
    .from('project_members')
    .delete()
    .eq('project_id', proj.id)
    .eq('user_id', aliceId)
  check('마지막 Lead 제거 차단 (EC-1)', errCode(error) === 'LAST_LEAD', error?.message ?? '지워져버렸다')
}
{
  const { error } = await alice
    .from('project_members')
    .update({ role: 'member' })
    .eq('project_id', proj.id)
    .eq('user_id', aliceId)
  check('마지막 Lead 강등 차단 (EC-1)', errCode(error) === 'LAST_LEAD', error?.message ?? '강등돼버렸다')
}

// ── 8. 활동 로그 위조 방지 ───────────────────────────────────
console.log('\n8. 활동 로그 · 알림')
{
  const { data } = await alice.from('activities').select('type').eq('task_id', task.id)
  const types = (data ?? []).map((a) => a.type)
  check('활동 로그 자동 기록', types.includes('created') && types.includes('status_changed'), types.join(','))
}
{
  const { error } = await alice
    .from('activities')
    .insert({ task_id: task.id, user_id: aliceId, type: 'created' })
  check('🔴 클라이언트가 활동 로그를 위조할 수 없다', !!error, error ? '' : '위조돼버렸다')
}
{
  const { data } = await bob.from('notifications').select('type')
  check('배정 알림 자동 생성 (US-801)', (data ?? []).some((n) => n.type === 'task_assigned'), JSON.stringify(data))
}
{
  const { data } = await bob.from('notifications').select('id').eq('user_id', aliceId)
  check('남의 알림은 안 보인다', data?.length === 0)
}

// ── 9. 뷰 ────────────────────────────────────────────────────
console.log('\n9. 뷰 (security_invoker)')
{
  const { data, error } = await alice.from('v_tasks_enriched').select('*').limit(1)
  check('v_tasks_enriched 조회', !error && data?.length > 0, error?.message)
}
{
  const { data } = await bob.from('v_tasks_enriched').select('id')
  check('🔴 뷰에도 RLS 가 적용된다 (Bob 은 3건만)', data?.length === 3, `개수: ${data?.length}`)
}
{
  const { data } = await alice.from('v_my_lead_projects').select('id')
  check('v_my_lead_projects (D-038)', data?.length === 2, `개수: ${data?.length}`)
}
{
  const { data } = await bob.from('v_my_lead_projects').select('id')
  check('Bob 은 Lead 프로젝트 0개 → 전체 탭 미노출', data?.length === 0, `개수: ${data?.length}`)
}
{
  const { data } = await alice.from('v_project_stats').select('*').eq('project_id', proj.id).single()
  check('진행률 계산 (D-009)', data?.total === 3 && data?.done === 1 && data?.progress === 33, JSON.stringify(data))
}

// ── 결과 ─────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`)
console.log(`통과 ${pass}  ·  실패 ${fail}`)
if (fail === 0) {
  console.log('\n🟢 DB 설계가 실제로 동작한다. 앱 코드를 시작해도 된다.\n')
} else {
  console.log('\n🔴 실패 항목을 고치기 전까지 앱 코드를 시작하지 않는다.\n')
}
console.log(`정리: Authentication > Users 에서 *${stamp}@example.com 계정 2개를 삭제한다.\n`)
process.exit(fail === 0 ? 0 : 1)
