-- core_task · 09 rpc
-- 근거: docs/06-API.md §4
--
-- REST 레이어를 만들지 않는다 (API §1). 여기 있는 6개는
-- "한 번의 사용자 행동이 여러 테이블을 원자적으로 바꿔야 하는" 경우뿐이다.

-- ─────────────────────────────────────────────────────────────
-- 4.1 워크스페이스 생성 (온보딩)
-- ─────────────────────────────────────────────────────────────

create or replace function create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- D-022: 1인 1워크스페이스
  if exists (select 1 from memberships where user_id = auth.uid()) then
    raise exception 'ALREADY_IN_WORKSPACE';
  end if;

  insert into workspaces (name, created_by) values (p_name, auth.uid())
  returning id into v_id;

  -- 트리거가 Owner 멤버십 + `개인 업무` 프로젝트를 만든다 (05_triggers §5.5)
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4.2 초대 수락
-- ─────────────────────────────────────────────────────────────

create or replace function accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv invitations;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_inv from invitations where token = p_token;

  if v_inv.id is null              then raise exception 'INVITE_NOT_FOUND';    end if;
  if v_inv.accepted_at is not null then raise exception 'INVITE_USED';         end if;
  if v_inv.expires_at < now()      then raise exception 'INVITE_EXPIRED';      end if;
  if exists (select 1 from memberships where user_id = auth.uid())
                                   then raise exception 'ALREADY_IN_WORKSPACE'; end if;

  insert into memberships (workspace_id, user_id, role)
  values (v_inv.workspace_id, auth.uid(), v_inv.role);

  -- D-033: 초대 시 지정한 프로젝트에 즉시 배치.
  -- 이게 없으면 팀원이 빈 대시보드를 보고 이탈한다 (User Flow §2 F0-B)
  if v_inv.project_id is not null then
    insert into project_members (project_id, user_id, role)
    values (v_inv.project_id, auth.uid(), 'member')
    on conflict do nothing;
  end if;

  update invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.workspace_id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4.3 카드 이동 · 재정렬
--     position 계산을 클라이언트에 맡기면 동시 드래그 시 값이 충돌한다.
-- ─────────────────────────────────────────────────────────────

create or replace function move_task(
  p_task uuid,
  p_assignee uuid default null,
  p_before uuid default null,
  p_after uuid default null,
  p_due date default null
)
returns tasks language plpgsql security definer set search_path = public as $$
declare
  v_prev double precision;
  v_next double precision;
  v_pos  double precision;
  v_row  tasks;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select position into v_prev from tasks where id = p_before;
  select position into v_next from tasks where id = p_after;

  v_pos := case
    when v_prev is null and v_next is null then 0
    when v_prev is null then v_next - 1024
    when v_next is null then v_prev + 1024
    else (v_prev + v_next) / 2      -- 주변 행을 건드리지 않는다
  end;

  update tasks
     set assignee_id = p_assignee,
         position    = v_pos,
         due_date    = coalesce(p_due, due_date)
   where id = p_task
   returning * into v_row;          -- 권한·규칙 검사는 tg_task_validate 가 한다

  if v_row.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  return v_row;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4.4 반려 — 상태 변경 + 사유 댓글 + 알림이 원자적이어야 한다
--     사유 없는 반려는 반드시 카톡을 부른다 (US-503 AC-3)
-- ─────────────────────────────────────────────────────────────

create or replace function reject_task(p_task uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;
  if not can_lead_task(p_task) then
    raise exception 'FORBIDDEN';
  end if;

  insert into comments (task_id, user_id, body)
  values (p_task, auth.uid(), '반려 사유: ' || p_reason);

  update tasks set status = 'in_progress'
   where id = p_task and status = 'in_review';

  if not found then raise exception 'NOT_IN_REVIEW'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4.5 가져가기 (US-403)
--     본인이 스스로 하는 약속이므로 마감일 건너뛰기가 없다 (AC-5)
-- ─────────────────────────────────────────────────────────────

create or replace function claim_task(p_task uuid, p_due date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_due is null      then raise exception 'DUE_REQUIRED';      end if;

  update tasks
     set assignee_id = auth.uid(), due_date = p_due
   where id = p_task and assignee_id is null;   -- 남의 업무는 가져올 수 없다 (EC-7)

  if not found then raise exception 'ALREADY_ASSIGNED'; end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4.6 멤버 제거 영향 범위 미리보기 (US-204)
--     실제 제거는 project_members DELETE 로 충분하다 (트리거가 처리)
-- ─────────────────────────────────────────────────────────────

create or replace function preview_member_removal(p_project uuid, p_user uuid)
returns table (id uuid, title text, status task_status)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.status
  from tasks t
  where t.project_id = p_project
    and t.assignee_id = p_user
    and t.status <> 'done'
    and t.deleted_at is null
    and is_project_lead(p_project)     -- 권한 없는 호출은 빈 결과
  order by t.status_changed_at
$$;
