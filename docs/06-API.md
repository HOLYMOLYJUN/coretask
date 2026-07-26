# core_task — API 설계

> **이 문서의 지위**
> [00-FOUNDATION.md](00-FOUNDATION.md) → [01-PRD.md](01-PRD.md) → [02-IA.md](02-IA.md) → [03-USER-FLOW.md](03-USER-FLOW.md) → [04-WIREFRAME.md](04-WIREFRAME.md) → [05-DB.md](05-DB.md) 를 상위 근거로 삼는다.
> 이 문서는 *"화면이 데이터를 어떻게 읽고 쓰는가"* 를 정의한다. **설계 문서의 마지막이다** — 이 다음은 M1 개발이다.
>
> | | |
> |---|---|
> | 버전 | v1.0 |
> | 최종 수정 | 2026-07-26 |
> | 스택 | **Vite + React SPA** · supabase-js · TanStack Query · Postgres RPC · Edge Functions (D-042) |
> | 상태 | 🟢 결정 완료. **설계 종료 — M1 개발 착수 가능** |

---

## 1. 가장 먼저 정할 것 — REST API를 만들지 않는다

**결론: 별도의 API 레이어를 만들지 않는다. 클라이언트가 `supabase-js` 로 테이블을 직접 읽고 쓴다.**

### 왜

DB 문서(§5~§7)에서 **권한과 불변식을 이미 DB가 판정하게 만들었다.**

- 조회 자격 → RLS 정책
- 상태 전이 적법성 → `tg_task_validate()` 트리거
- 마지막 Lead 보호 → `tg_guard_last_lead()` 트리거
- 활동 로그·알림 생성 → `tg_task_audit()` 트리거

**여기서 REST 레이어를 하나 더 얹으면, 같은 규칙을 두 번 쓰게 된다.** 그리고 두 벌이 된 규칙은 반드시 갈라진다 — Foundation §6.1에서 `status` 를 하나로 통일한 것과 정확히 같은 논리다.

> **원칙: 규칙은 DB에 한 벌만 존재한다. API는 그 규칙을 옮겨 적지 않는다.**

### 그럼 API 레이어는 언제 필요한가

**"한 번의 사용자 행동이 여러 테이블을 원자적으로 바꿔야 할 때"** 뿐이다. 그건 REST가 아니라 **Postgres 함수(RPC)** 로 만든다 — 트랜잭션 안에서 실행되고, 권한도 같은 함수들을 재사용하기 때문이다.

### 3계층 정리

| 계층 | 쓰는 곳 | 예 |
|---|---|---|
| **① 직접 테이블 접근** (기본) | 조회 전부 + 단순 쓰기 | 보드 로딩, 상태 변경, 댓글 작성 |
| **② RPC** (`supabase.rpc()`) | 다중 테이블 원자적 변경 | 워크스페이스 생성, 초대 수락, 카드 재정렬 |
| **③ Edge Function** (service_role) | 클라이언트가 가지면 안 되는 권한 | 초대 메일 발송, 웹 푸시 발송, 마감 알림 배치 |

**②가 6개, ③이 3개다. 그 외 전부 ①이다.**

---

## 2. 조회 — 화면별 쿼리

모든 조회는 RLS가 걸린 상태로 나간다. **"내가 볼 수 있는 것"을 클라이언트가 필터링하지 않는다.**

### 2.1 배정 보드 `/projects/[id]/board`

```ts
// 컬럼 = 프로젝트 멤버
const { data: members } = await supabase
  .from('project_members')
  .select('role, profiles(id, name, avatar_url)')
  .eq('project_id', projectId)

// 카드 = 미완료 Task 전부 (done 은 접혀 있으므로 별도 조회)
const { data: tasks } = await supabase
  .from('v_tasks_enriched')          // 정체·지연·마감없음이 계산되어 나온다
  .select('*')
  .eq('project_id', projectId)
  .neq('status', 'done')
  .order('position')
```

> 💡 **`v_tasks_enriched` 를 쓰는 이유:** `is_stale` 판정에 **프로젝트별 임계값**(D-027)이 필요하다. 클라이언트에서 계산하면 임계값을 따로 내려받아 조인해야 하고, 계산식이 웹·모바일에 중복된다.

**필터 칩**(US-404)은 재조회하지 않는다. 이미 받은 배열을 클라이언트에서 거른다 — 프로젝트당 Task는 수백 건이고, 칩 전환에 왕복이 끼면 "그 자리에서 보인다"는 설계가 무너진다.

### 2.2 내 업무 보드 `/tasks`

```ts
const { data } = await supabase
  .from('v_tasks_enriched')
  .select('*')
  .eq('assignee_id', userId)
  .neq('status', 'done')
  .order('position')
// project_name 이 뷰에 포함되어 있다 — 카드에 프로젝트명을 표시해야 하므로 (Wireframe §4)
```

### 2.3 대시보드

```ts
// 내 업무 탭
const today = await supabase.from('v_tasks_enriched').select('*')
  .eq('assignee_id', userId).neq('status','done')
  .or(`due_date.lte.${todayISO},status.eq.in_progress`)

// 전체 탭 — 범위는 "내가 Lead 인 프로젝트" (D-016c)
const { data: leadProjects } = await supabase
  .from('project_members').select('project_id')
  .eq('user_id', userId).eq('role','lead')

const ids = leadProjects.map(p => p.project_id)

const reviewQueue = await supabase.from('v_tasks_enriched').select('*')
  .in('project_id', ids).eq('status','in_review')
  .order('status_changed_at')                    // 오래 기다린 것부터

const delayed = await supabase.from('v_tasks_enriched').select('*')
  .in('project_id', ids).or('is_stale.eq.true,is_overdue.eq.true')

const stats = await supabase.from('v_project_stats').select('*').in('project_id', ids)
```

> ⚠️ **WS Admin은 `leadProjects` 조회로 프로젝트가 안 잡힌다.** `project_members` 행이 없어도 Lead 권한을 갖기 때문이다(D-016d). Admin이면 `projects` 전체를 범위로 쓴다 — §9-1 참조.

### 2.4 Task 상세 · 타임라인

```ts
const task = await supabase.from('v_tasks_enriched').select('*').eq('id', taskId).single()

const [comments, activities] = await Promise.all([
  supabase.from('comments').select('*, profiles(name, avatar_url)')
    .eq('task_id', taskId).order('created_at'),
  supabase.from('activities').select('*, profiles(name)')
    .eq('task_id', taskId).order('created_at'),
])
// 클라이언트에서 created_at 으로 병합 정렬 → 하나의 타임라인 (US-603)
```

---

## 3. 쓰기 — 직접 접근으로 충분한 것들

### 3.1 배정 (F1) ⭐

```ts
// 드래그 드롭 = UPDATE 한 줄. 그것뿐이다 (D-018a)
await supabase.from('tasks')
  .update({ assignee_id: targetUserId, position: newPos })
  .eq('id', taskId)
```

**이 한 줄이 일으키는 일 (전부 트리거가 처리한다)**
- `activities` 에 `assigned` 기록
- 담당자에게 `notifications` 생성 → Edge Function이 푸시 발송
- 담당자가 프로젝트 멤버가 아니면 `INVALID_ASSIGNEE` 로 거부
- 팀원이 남의 카드를 옮기려 하면 `FORBIDDEN` 으로 거부

> **클라이언트 코드에 권한 검사가 없다는 게 핵심이다.** UI는 드래그를 비활성화할 뿐이고, 실제 차단은 DB가 한다.

**마감일 팝오버**(US-304)는 별도 요청이 아니다. 값을 함께 보낸다.
```ts
.update({ assignee_id: targetUserId, position: newPos, due_date: picked })
```

### 3.2 상태 변경 (F2) · 완료 확정 (F3)

```ts
await supabase.from('tasks').update({ status: 'in_review' }).eq('id', taskId)
// → Lead 전원에게 알림. 리뷰 요청 버튼이 따로 없는 이유 (US-502)

await supabase.from('tasks').update({ status: 'done' }).eq('id', taskId)
// → Lead 가 아니면 FORBIDDEN. in_review 를 거치지 않았으면 INVALID_TRANSITION
```

**반려는 사유가 필수이므로 RPC다** (§4.4).

### 3.3 Task 생성 · 댓글 · 문서

```ts
await supabase.from('tasks').insert({
  project_id, title, created_by: userId,
  assignee_id: columnUserId ?? null,     // 어느 컬럼에서 만들었는지가 곧 담당자 (F4)
})

await supabase.from('comments').insert({ task_id, user_id: userId, body, mentions })

await supabase.from('documents').insert({ project_id, title, url, source, created_by: userId })
```

---

## 4. RPC — 원자성이 필요한 6개

```sql
-- 10_rpc.sql
```

### 4.1 `create_workspace(name)` — 온보딩

워크스페이스 + Owner 멤버십 + `개인 업무` 프로젝트가 **함께 생기거나 함께 실패해야** 한다.
DB §7.5의 트리거가 이미 처리하므로, RPC는 얇게 감싸기만 한다.

```sql
create or replace function create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if exists (select 1 from memberships where user_id = auth.uid()) then
    raise exception 'ALREADY_IN_WORKSPACE';   -- D-022
  end if;
  insert into workspaces (name, created_by) values (p_name, auth.uid()) returning id into v_id;
  return v_id;   -- 트리거가 멤버십 + 개인 업무 프로젝트를 만든다
end $$;
```

### 4.2 `accept_invitation(token)` — 초대 수락

```sql
create or replace function accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv invitations;
begin
  select * into v_inv from invitations where token = p_token;

  if v_inv is null                    then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inv.accepted_at is not null     then raise exception 'INVITE_USED';      end if;
  if v_inv.expires_at < now()          then raise exception 'INVITE_EXPIRED';   end if;
  if exists (select 1 from memberships where user_id = auth.uid())
                                       then raise exception 'ALREADY_IN_WORKSPACE'; end if;

  insert into memberships (workspace_id, user_id, role)
  values (v_inv.workspace_id, auth.uid(), v_inv.role);

  -- D-033: 초대 시 지정한 프로젝트에 즉시 배치.
  -- 이게 없으면 팀원이 빈 대시보드를 보고 이탈한다 (User Flow §2 F0-B)
  if v_inv.project_id is not null then
    insert into project_members (project_id, user_id, role)
    values (v_inv.project_id, auth.uid(), 'member') on conflict do nothing;
  end if;

  update invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.workspace_id;
end $$;
```

### 4.3 `move_task(task_id, assignee_id, before_id, after_id)` — 재정렬

`position` 계산을 클라이언트에 맡기면 **동시 드래그 시 값이 충돌한다.**

```sql
create or replace function move_task(
  p_task uuid, p_assignee uuid, p_before uuid, p_after uuid, p_due date default null
) returns tasks language plpgsql security definer set search_path = public as $$
declare v_prev double precision; v_next double precision; v_pos double precision; v_row tasks;
begin
  select position into v_prev from tasks where id = p_before;
  select position into v_next from tasks where id = p_after;

  v_pos := case
    when v_prev is null and v_next is null then 0
    when v_prev is null then v_next - 1024
    when v_next is null then v_prev + 1024
    else (v_prev + v_next) / 2          -- 주변 행을 건드리지 않는다 (DB §4.3)
  end;

  update tasks
     set assignee_id = p_assignee,
         position    = v_pos,
         due_date    = coalesce(p_due, due_date)
   where id = p_task
   returning * into v_row;              -- 권한·규칙 검사는 tg_task_validate 가 한다

  return v_row;
end $$;
```

### 4.4 `reject_task(task_id, reason)` — 반려

**상태 변경 + 사유 댓글 + 알림이 원자적이어야 한다.** 사유 없는 반려는 카톡을 부른다(US-503 AC-3).

```sql
create or replace function reject_task(p_task uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_reason,''))) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;
  if not can_lead_task(p_task) then
    raise exception 'FORBIDDEN';
  end if;

  insert into comments (task_id, user_id, body)
  values (p_task, auth.uid(), '반려 사유: ' || p_reason);

  update tasks set status = 'in_progress' where id = p_task and status = 'in_review';
end $$;
```

### 4.5 `claim_task(task_id, due_date)` — 가져가기 (US-403)

```sql
create or replace function claim_task(p_task uuid, p_due date)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 본인이 스스로 하는 약속이므로 마감일 건너뛰기가 없다 (US-403 AC-5)
  if p_due is null then raise exception 'DUE_REQUIRED'; end if;

  update tasks set assignee_id = auth.uid(), due_date = p_due
   where id = p_task and assignee_id is null;    -- 남의 업무는 가져올 수 없다 (EC-7)

  if not found then raise exception 'ALREADY_ASSIGNED'; end if;
end $$;
```

### 4.6 `create_project(...)` — 프로젝트 생성 (D-045 · 구현 중 추가)

**원래 직접 INSERT로 설계했으나 실제로 동작하지 않았다.**

클라이언트가 `insert().select()` 를 쓰면 PostgREST는 `return=representation` 을 보내고, 그러면 **INSERT 시점에 SELECT 정책까지 통과해야 한다.** 그런데 `projects_read` 는 `is_project_member(id)` 를 보고, 그 근거인 `project_members` 행은 `project_bootstrap`(AFTER INSERT) 트리거가 만든다. RETURNING 검사 시점에는 아직 없다.

```
42501 new row violates row-level security policy for table "projects"
```

> 💡 **애초에 §4의 RPC 조건에 해당하는 행위였다.** 프로젝트 생성은 `projects` + `project_members` **두 행을 원자적으로 만든다.** 직접 INSERT로 설계한 것이 실수였다.

```sql
create or replace function create_project(
  p_name text, p_description text default null, p_customer text default null,
  p_start_date date default null, p_end_date date default null,
  p_priority task_priority default 'normal'
) returns projects language plpgsql security definer set search_path = public as $$
declare v_ws uuid; v_row projects;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_ws := current_workspace_id();
  if v_ws is null then raise exception 'NO_WORKSPACE'; end if;
  if not is_workspace_admin(v_ws) then raise exception 'FORBIDDEN'; end if;

  insert into projects (workspace_id, name, description, customer,
                        start_date, end_date, priority, created_by)
  values (v_ws, p_name, p_description, p_customer,
          p_start_date, p_end_date, p_priority, auth.uid())
  returning * into v_row;
  return v_row;   -- project_bootstrap 트리거가 생성자를 Lead 로 넣는다
end $$;
```

> ⚠️ **같은 함정이 반복될 수 있는 곳:** "생성 직후 조회 권한의 근거를 AFTER 트리거가 만드는" 구조는 전부 이 문제를 갖는다.
> `tasks` · `comments` · `documents` 는 **삽입 시점에 이미 `is_project_member` 가 참**이므로 안전하다. 새 테이블을 추가할 때 이 조건을 확인한다.

### 4.7 `remove_project_member(project_id, user_id)` — 이탈 처리 미리보기

제거 **전에** 영향 범위를 보여줘야 하므로(US-204), 조회용 함수를 짝으로 둔다.

```sql
create or replace function preview_member_removal(p_project uuid, p_user uuid)
returns table (id uuid, title text, status task_status)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.status from tasks t
  where t.project_id = p_project and t.assignee_id = p_user
    and t.status <> 'done' and t.deleted_at is null
  order by t.status_changed_at
$$;
-- 실제 제거는 project_members DELETE 로 충분하다.
-- tg_member_removed 가 미배정 전환 + Lead 알림을 처리한다 (DB §7.3)
```

---

## 5. Edge Function — service_role이 필요한 3개

**클라이언트가 절대 가지면 안 되는 권한을 쓰는 것만 여기 둔다.**

### 5.1 `send-invite` — 초대 메일

이메일이 필요한 **유일한 지점**이다(D-019a). 로그인 전이라 푸시를 보낼 수 없다.

```
POST /functions/v1/send-invite
Body: { invitationId }
→ invitations 조회 → 메일 발송 (Resend)
```

### 5.2 `send-push` — 웹 푸시 (D-037)

`notifications` 테이블에 행이 생기면 발송한다. **Supabase 내장 Database Webhook** 으로 트리거한다.

```
notifications INSERT
   └→ Database Webhook → send-push
        └→ push_subscriptions 조회 → Web Push 발송
             ├→ 성공  → notifications.pushed_at = now()
             └→ 410 Gone → 해당 구독 삭제 (만료된 기기 정리)
```

**Database Webhook을 고른 이유**
Dashboard(`Database > Webhooks`)에서 테이블·이벤트·대상 Edge Function만 지정하면 트리거가 자동 생성된다. 직접 짤 필요가 없고, 요청/응답이 `net._http_response` 에 남아 실패를 눈으로 확인할 수 있다.

> ⚠️ **Database Webhook은 `pg_net` 위의 관리형 래퍼다.** 둘은 대립하는 선택지가 아니다.
> `pg_net` 은 **비동기**라 트랜잭션을 막지 않는다. 그리고 **둘 다 자동 재시도가 없다** — 이게 진짜 주의점이다.

**실패 대비 — 알림이 조용히 사라지는 유일한 경로를 막는다**

푸시 발송이 실패해도 `notifications` 행은 남으므로 **인앱 알림과 벨 뱃지는 정상 동작한다.** 하지만 폰 푸시가 안 오면 *"출근길에 확인"* 시나리오가 깨지고, 그건 Foundation §6.4의 전제를 무너뜨린다.

```sql
alter table notifications add column pushed_at timestamptz;

-- 5분마다, 아직 발송되지 않은 알림을 재시도한다
select cron.schedule('retry-push', '*/5 * * * *', $$
  select net.http_post(
    url     := current_setting('app.push_fn_url'),
    headers := jsonb_build_object('Authorization', current_setting('app.service_key')),
    body    := jsonb_build_object('notification_id', n.id)
  )
  from notifications n
  where n.pushed_at is null
    and n.created_at > now() - interval '1 day'   -- 하루 지난 건 포기한다
  limit 100
$$);
```

> 💡 **`created_at > now() - interval '1 day'` 가 중요하다.** 만료된 구독이나 영구 실패를 무한 재시도하면 cron이 매번 같은 행을 긁는다. **어제 배정된 업무의 푸시는 지금 와도 의미가 없다** — 그건 이미 인앱에서 봤다.

**페이로드는 클릭 시 착지할 URL을 반드시 포함한다** (User Flow §8).
```json
{ "title": "새 업무가 배정되었습니다",
  "body": "로그인 API 연동 · 마케팅몬스터 · ~7/28",
  "url": "/tasks/{taskId}" }
```

### 5.3 `notify-due` — 마감 알림 배치

`pg_cron` 으로 매일 09:00 실행.

```sql
select cron.schedule('notify-due', '0 0 * * *', $$
  insert into notifications (user_id, type, task_id, project_id)
  select t.assignee_id,
         case when t.due_date < current_date then 'due_passed' else 'due_soon' end,
         t.id, t.project_id
  from tasks t
  where t.deleted_at is null and t.status <> 'done'
    and t.assignee_id is not null
    and t.due_date in (current_date + 1, current_date)
$$);
```
→ `notifications` INSERT가 §5.2 웹훅을 타므로 푸시는 자동으로 나간다.

> ⚠️ **UTC 주의.** `0 0 * * *` 는 UTC 자정 = KST 09:00 이다. 서버 타임존을 바꾸지 말고 **cron 표현식에서 맞춘다** — 타임존 설정 변경은 다른 쿼리에 조용히 영향을 준다.

---

## 6. 에러 규약 — 이 문서에서 가장 실용적인 부분 🔑

**DB 트리거가 던지는 예외는 `MESSAGE: 설명` 형태다.** 클라이언트는 `:` 앞 코드로 분기하고, 아래 표의 문구를 보여준다.

```ts
function parseDbError(e: PostgrestError): { code: string; detail: string } {
  const m = /^([A-Z_]+)(?::\s*(.*))?$/.exec(e.message ?? '')
  return m ? { code: m[1], detail: m[2] ?? '' } : { code: 'UNKNOWN', detail: e.message }
}
```

| 코드 | 발생 지점 | 사용자에게 보여줄 문구 | UI 처리 |
|---|---|---|---|
| `INVALID_TRANSITION` | 상태 전이 트리거 | **완료 확정은 리뷰를 거쳐야 합니다. 먼저 리뷰중으로 올려주세요** | 카드 원위치 + 토스트 |
| `FORBIDDEN` | 상태·배정 트리거 | **완료 확정은 Lead가 합니다. 리뷰중으로 올려주세요** | 카드 원위치 + 토스트 |
| `INVALID_ASSIGNEE` | 배정 트리거 | **이 사람은 프로젝트 멤버가 아니에요. 먼저 프로젝트에 추가해주세요** | 원위치 + 멤버 추가 링크 |
| `LAST_LEAD` | `tg_guard_last_lead` | **프로젝트에는 최소 1명의 Lead가 필요합니다** | 드롭다운 되돌림 |
| `LAST_OWNER` | `tg_guard_last_owner` | **워크스페이스에는 최소 1명의 Owner가 필요합니다** | 〃 |
| `ALREADY_IN_WORKSPACE` | `create_workspace` / `accept_invitation` | **이미 다른 워크스페이스에 참여 중이에요** | 대시보드로 이동 |
| `INVITE_EXPIRED` | `accept_invitation` | **초대가 만료되었습니다. 초대한 분에게 다시 요청해주세요** | 전용 안내 화면 |
| `INVITE_USED` | 〃 | **이미 사용된 초대예요** | 〃 |
| `INVITE_NOT_FOUND` | 〃 | **초대를 찾을 수 없어요. 링크를 다시 확인해주세요** | 〃 |
| `REASON_REQUIRED` | `reject_task` | **반려 사유를 입력해주세요** | 입력창 포커스 |
| `DUE_REQUIRED` | `claim_task` | **언제까지 하실 건지 정해주세요** | 퀵칩 포커스 |
| `ALREADY_ASSIGNED` | `claim_task` | **다른 분이 먼저 가져갔어요** | 보드 재조회 |
| `NO_WORKSPACE` | `create_project` | **워크스페이스에 먼저 참여해야 해요** | 온보딩으로 |
| `NOT_IN_REVIEW` | `reject_task` | **이미 처리된 업무예요** | 재조회 |
| `23505` (unique) | 초대 중복 | **이미 참여 중이거나 초대한 멤버예요** | 인라인 |
| `PGRST116` (0 rows) | RLS 차단 | — | **404 페이지** (403 아님, D-032) |

**문구 규칙 3개**
1. **무엇이 잘못됐는지 + 어떻게 하면 되는지**를 한 문장에 담는다. `FORBIDDEN` 을 "권한이 없습니다"로 끝내지 않는다.
2. **사과하지 않는다.** "죄송합니다"는 정보가 0이다.
3. **DB 코드를 노출하지 않는다.** 사용자는 `INVALID_TRANSITION` 을 읽을 이유가 없다.

> ⚠️ **`PGRST116` → 404 매핑이 D-032의 실제 구현이다.**
> RLS가 막으면 Supabase는 에러가 아니라 **0건**을 돌려준다. 이걸 "권한 없음"으로 표시하면 *"있지만 못 본다"* 가 새어나가고, 프로젝트 ID를 훑으면 개수가 유출된다. **없는 것처럼 다룬다.**

---

## 7. 낙관적 업데이트 규약

배정은 **주 수십 회 반복되는 행동**이라 서버 응답을 기다리면 흐름이 끊긴다(PRD §7).

**3단계로 고정한다.** TanStack Query의 `onMutate` / `onError` / `onSettled` 에 그대로 대응된다 (구현 예시는 §8).

| 단계 | 하는 일 |
|---|---|
| ① 즉시 | 로컬 캐시를 낙관적으로 바꾼다 → **카드가 바로 이동한다** |
| ② 전송 | `supabase.rpc('move_task', …)` |
| ③ 실패 시 | **이전 상태로 롤백 + §6 표의 문구를 토스트로** |

**되돌릴 때 반드시 이유를 함께 보여준다.** 카드만 슬쩍 돌아가면 사용자는 자기 손이 미끄러졌다고 생각하고, 같은 시도를 반복한다.

**Realtime을 껐으므로**(D-035) 다른 사람의 변경은 이 시점에 반영한다:

| 시점 | 구현 |
|---|---|
| 창 포커스 복귀 | `refetchOnWindowFocus: true` (TanStack Query 기본값) |
| 30초 경과 후 재진입 | `staleTime: 30_000` |
| 알림 클릭 진입 | 라우트 진입 시 `invalidateQueries` |

> 💡 **세 가지 모두 직접 짤 코드가 없다.** D-035(Realtime 미사용)를 택했을 때 필요한 대체 동작이 TanStack Query의 기본 동작과 거의 일치한다 — D-042에서 이 조합을 고른 이유 중 하나다.

---

## 8. 타입 · 클라이언트 구성

```bash
supabase gen types typescript --linked > packages/types/src/database.ts
```

**스키마를 바꾸면 이 명령을 다시 돌린다.** 손으로 타입을 쓰지 않는다 — DB가 유일한 진실이므로 타입도 거기서 나와야 한다.

```
packages/types/   database.ts (생성됨) + 도메인 타입 (TaskWithMeta 등)
packages/ui/      Wireframe §9의 컴포넌트 12개
apps/web/
  src/
    lib/supabase.ts   단일 클라이언트 (브라우저 전용)
    lib/errors.ts     §6 코드 → 문구 매핑
    routes.tsx        react-router · backgroundLocation 패턴 (IA §5)
    features/
      board/          배정 보드 · 드래그 · 마감일 팝오버
      my-tasks/       내 업무 보드 · 모바일 리스트
      task/           상세 패널 · 타임라인
      dashboard/      위젯
  vite.config.ts      vite-plugin-pwa 설정 (D-019b 캐시 전략)
vercel.json           SPA rewrite
```

> 💡 **Supabase 클라이언트가 하나뿐이다** (D-042). 서버/브라우저 두 벌을 만들 필요가 없다 — 서버 컴포넌트가 없기 때문이다. `@supabase/ssr` 쿠키 세션·갱신 미들웨어가 통째로 빠진다.

### 데이터 계층 — TanStack Query

```ts
// 포커스 복귀 시 재조회가 D-035(Realtime 미사용)의 대체 수단이다
const qc = new QueryClient({
  defaultOptions: { queries: {
    refetchOnWindowFocus: true,     // ← D-035
    staleTime: 30_000,
  }},
})
```

**낙관적 업데이트(§7)는 `onMutate` / `onError` 로 그대로 대응된다.**

```ts
useMutation({
  mutationFn: (v) => supabase.rpc('move_task', v),
  onMutate: async (v) => {
    await qc.cancelQueries({ queryKey: ['board', projectId] })
    const prev = qc.getQueryData(['board', projectId])
    qc.setQueryData(['board', projectId], (old) => move(old, v))
    return { prev }                                    // 롤백용
  },
  onError: (err, _v, ctx) => {
    qc.setQueryData(['board', projectId], ctx.prev)    // 카드 원위치
    toast(MESSAGE[parseDbError(err).code])             // §6 표의 문구
  },
  onSettled: () => qc.invalidateQueries({ queryKey: ['board', projectId] }),
})
```

### 성능 — SPA로도 1.5초 목표를 만족한다

| 단계 | 시간 |
|---|---|
| HTML 셸 (정적) | 즉시 |
| JS 번들 ~200KB gzip | ~300ms |
| 인증 확인 (localStorage) | 즉시 |
| Supabase 쿼리 (서울 리전) | 50~100ms |
| **합계** | **1초 미만** |

**재방문부터는 서비스 워커가 앱 셸을 캐시하므로 더 빨라진다.** 단, **데이터는 캐시하지 않는다**(D-019b) — 캐시되는 것은 JS·CSS·아이콘뿐이다.

### PWA 캐시 전략 (D-019b)

```ts
// vite.config.ts
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],  // 앱 셸만
    navigateFallbackDenylist: [/^\/api/],
    runtimeCaching: [],        // ← 비워둔다. 데이터는 절대 캐시하지 않는다
  },
})
```

> ⚠️ **`runtimeCaching` 이 비어 있는 것이 의도다.** Supabase 응답을 하나라도 캐시하면 오래된 보드를 보여주게 된다 — 업무 도구에서 **틀린 데이터는 없는 데이터보다 나쁘다**(US-802 AC-7).

### Vercel 배포

```json
// vercel.json — 클라이언트 라우팅을 위한 SPA rewrite
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## 9. 결정 완료 (2026-07-26)

| # | 질문 | 결정 |
|---|---|---|
| 1 | WS Admin의 "전체 보기" 범위 | **`v_my_lead_projects` 뷰로 흡수** (D-038). 대시보드는 분기 없이 이 뷰만 조인한다 |
| 2 | 푸시 발송 방식 | **Supabase Database Webhook + `pushed_at` 재시도 cron** (D-037) |

### D-038 — `v_my_lead_projects`

Admin은 `project_members` 행 없이도 Lead 권한을 갖는다(D-016d). 이걸 대시보드 쿼리에서 분기하면 **같은 규칙이 두 벌**이 된다. §1의 원칙("규칙은 DB에 한 벌")을 여기에도 적용한다.

```sql
create or replace view v_my_lead_projects as
select p.*
from projects p
where p.deleted_at is null
  and p.status = 'active'
  and (
    exists (select 1 from project_members pm
            where pm.project_id = p.id and pm.user_id = auth.uid() and pm.role = 'lead')
    or is_workspace_admin(p.workspace_id)      -- D-016d
  );

alter view v_my_lead_projects set (security_invoker = true);
```

**§2.3의 대시보드 전체 탭 쿼리가 이렇게 단순해진다.**

```ts
// 분기 없음. Admin이든 Lead든 이 뷰가 알아서 범위를 결정한다
const { data: scope } = await supabase.from('v_my_lead_projects').select('id')
const ids = scope.map(p => p.id)

// "전체 탭을 보여줄까?" 판정도 같은 뷰로
const showAllTab = ids.length > 0        // US-702 AC-1
```

> 💡 **`showAllTab` 판정까지 같은 뷰에서 나온다는 게 이 뷰의 진짜 값어치다.** 탭 노출 조건과 집계 범위가 어긋날 수 없다.

---

## 10. 설계 완료 — M1 착수 체크리스트

```
[완료] Foundation · PRD · IA · User Flow · Wireframe · DB · API
   ↓
[다음] M1 개발
```

**개발 첫날 순서** — 상세 절차는 [07-SETUP.md](07-SETUP.md)

1. Supabase 프로젝트 생성 → `supabase link` (SETUP Part 1~4)
2. `supabase db push` (마이그레이션 10개 — DB §12)
3. Auth 설정: 이메일/비밀번호. **Google OAuth는 M3~M4로 미룬다** (SETUP §3-2)
4. `supabase gen types typescript` → `packages/types`
5. 🔴 **RLS 검증부터 한다** (SETUP Part 6-2). 계정 2개로 "남의 프로젝트가 안 보이는지" "팀원이 `done` 으로 못 옮기는지"를 **코드 짜기 전에** 확인한다 — 나중에 확인하면 이미 데이터가 들어가 있다
6. 프론트엔드 스캐폴딩

```powershell
npm create vite@latest apps/web -- --template react-ts
npm i @supabase/supabase-js @tanstack/react-query react-router @dnd-kit/core
npm i -D vite-plugin-pwa tailwindcss
```

7. Vercel 연결 (`vercel.json` SPA rewrite) · `VITE_` 환경변수 등록
8. **자동 백업은 M3 전에** (D-041 — Pro 전환 시점)

**M1 완료 조건** (Foundation §12)
> 로그인 → 프로젝트 생성 → Task 생성 → **배정 보드에서 드래그 배정 + 마감일 지정 + 가져가기가 끝까지 동작**

**M1에 포함되는 스토리** (PRD §10)
`US-101 · 102 · 201 · 202 · 301 · 302 · 304 · 401 · 402 · 403`
