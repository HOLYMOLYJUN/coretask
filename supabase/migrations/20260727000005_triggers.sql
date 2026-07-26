-- core_task · 05 triggers
-- 근거: docs/05-DB.md §7
--
-- RLS 가 "이 행을 만질 자격" 을 보고, 여기가 "이 변화가 적법한가" 를 본다.

-- ─────────────────────────────────────────────────────────────
-- 5.0 Task 생성 시 불변식 강제
--     US-301 AC-3: status 는 생성 시 항상 todo (예외 없음, D-018)
-- ─────────────────────────────────────────────────────────────

create or replace function tg_task_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.status            := 'todo';
  new.completed_at      := null;
  new.status_changed_at := now();

  if new.assignee_id is not null then
    if not exists (select 1 from project_members
                   where project_id = new.project_id and user_id = new.assignee_id) then
      raise exception 'INVALID_ASSIGNEE: 담당자가 프로젝트 멤버가 아닙니다';
    end if;
    -- 남에게 배정하려면 Lead 여야 한다. 본인 것은 누구나 가능 (Foundation §2 철학 4)
    if new.assignee_id <> auth.uid() and not is_project_lead(new.project_id) then
      raise exception 'FORBIDDEN: 업무 배정은 Lead 권한입니다';
    end if;
  end if;

  return new;
end $$;

create trigger task_before_insert before insert on tasks
  for each row execute function tg_task_before_insert();

-- ─────────────────────────────────────────────────────────────
-- 5.1 상태 전이 · 배정 규칙 검사 (PRD §6 상태 전이표)
-- ─────────────────────────────────────────────────────────────

create or replace function tg_task_validate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_lead boolean := is_project_lead(new.project_id);
begin
  if new.status is distinct from old.status then

    -- 리뷰 단계를 건너뛸 수 없다.
    -- 예외: 미배정 Task 는 Lead 가 바로 닫을 수 있다 (취소된 업무 정리, EC-8)
    if new.status = 'done'
       and old.status <> 'in_review'
       and not (v_is_lead and new.assignee_id is null) then
      raise exception 'INVALID_TRANSITION: % -> done. in_review 를 거쳐야 합니다', old.status;
    end if;

    if old.status = 'todo' and new.status = 'in_review' then
      raise exception 'INVALID_TRANSITION: 시작하지 않은 업무는 리뷰할 수 없습니다';
    end if;

    -- D-007: 완료 확정과 되돌리기는 Lead 만
    if (new.status = 'done' or old.status = 'done') and not v_is_lead then
      raise exception 'FORBIDDEN: 완료 확정은 Lead 권한입니다';
    end if;

    new.status_changed_at := now();
    new.completed_at := case when new.status = 'done' then now() else null end;

    -- D-021c: start_date 가 비어 있으면 실제 시작 시점을 기록
    if new.status = 'in_progress' and new.start_date is null then
      new.start_date := current_date;
    end if;
  end if;

  -- 배정 규칙
  if new.assignee_id is distinct from old.assignee_id then
    if not v_is_lead then
      -- US-403: 팀원은 "미배정 -> 본인" 만 가능 (가져가기)
      if not (old.assignee_id is null and new.assignee_id = auth.uid()) then
        raise exception 'FORBIDDEN: 미배정 업무를 본인에게만 가져올 수 있습니다';
      end if;
    end if;

    if new.assignee_id is not null
       and not exists (select 1 from project_members
                       where project_id = new.project_id and user_id = new.assignee_id) then
      raise exception 'INVALID_ASSIGNEE: 담당자가 프로젝트 멤버가 아닙니다';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger task_validate before update on tasks
  for each row execute function tg_task_validate();

-- ─────────────────────────────────────────────────────────────
-- 5.2 활동 로그 · 알림 자동 기록
--     US-801 AC-2: 본인이 일으킨 이벤트는 본인에게 알리지 않는다 (<> auth.uid())
-- ─────────────────────────────────────────────────────────────

create or replace function tg_task_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activities (task_id, user_id, type) values (new.id, new.created_by, 'created');

  if new.assignee_id is not null and new.assignee_id <> new.created_by then
    insert into notifications (user_id, type, task_id, project_id, actor_id)
    values (new.assignee_id, 'task_assigned', new.id, new.project_id, new.created_by);
  end if;
  return null;
end $$;

create trigger task_created after insert on tasks
  for each row execute function tg_task_created();


create or replace function tg_task_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_admin_only boolean;
begin
  -- WS Admin 이면서 프로젝트 Lead 가 아닌 경우 = 관리자 권한 개입 (D-016d)
  select (not exists (
           select 1 from project_members
           where project_id = new.project_id and user_id = auth.uid() and role = 'lead'
         ))
         and is_project_lead(new.project_id)
    into v_admin_only;

  -- 담당자 변경
  if new.assignee_id is distinct from old.assignee_id then
    insert into activities (task_id, user_id, type, payload, via_admin)
    values (new.id, auth.uid(),
            case when new.assignee_id is null then 'unassigned' else 'assigned' end,
            jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id), v_admin_only);

    if new.assignee_id is not null and new.assignee_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
      insert into notifications (user_id, type, task_id, project_id, actor_id)
      values (new.assignee_id, 'task_assigned', new.id, new.project_id, auth.uid());
    end if;

    -- 팀원이 스스로 가져간 경우 Lead 에게 알린다 (US-403 AC-3)
    if new.assignee_id = auth.uid() and old.assignee_id is null then
      insert into notifications (user_id, type, task_id, project_id, actor_id, payload)
      select pm.user_id, 'task_assigned', new.id, new.project_id, auth.uid(),
             jsonb_build_object('claimed', true)
      from project_members pm
      where pm.project_id = new.project_id
        and pm.role = 'lead'
        and pm.user_id <> auth.uid();
    end if;
  end if;

  -- 상태 변경
  if new.status is distinct from old.status then
    insert into activities (task_id, user_id, type, payload, via_admin)
    values (new.id, auth.uid(), 'status_changed',
            jsonb_build_object('from', old.status, 'to', new.status), v_admin_only);

    -- 리뷰 요청 -> 그 프로젝트 Lead 전원 (D-017)
    if new.status = 'in_review' then
      insert into notifications (user_id, type, task_id, project_id, actor_id)
      select pm.user_id, 'review_requested', new.id, new.project_id, auth.uid()
      from project_members pm
      where pm.project_id = new.project_id
        and pm.role = 'lead'
        and pm.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
    end if;

    -- 완료 확정 / 반려 -> 담당자
    if new.assignee_id is not null
       and new.assignee_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
      if new.status = 'done' then
        insert into notifications (user_id, type, task_id, project_id, actor_id)
        values (new.assignee_id, 'task_completed', new.id, new.project_id, auth.uid());
      elsif old.status = 'in_review' and new.status = 'in_progress' then
        insert into notifications (user_id, type, task_id, project_id, actor_id)
        values (new.assignee_id, 'task_rejected', new.id, new.project_id, auth.uid());
      end if;
    end if;
  end if;

  -- 마감일 변경
  if new.due_date is distinct from old.due_date then
    insert into activities (task_id, user_id, type, payload, via_admin)
    values (new.id, auth.uid(), 'due_changed',
            jsonb_build_object('from', old.due_date, 'to', new.due_date), v_admin_only);
  end if;

  return null;
end $$;

create trigger task_audit after update on tasks
  for each row execute function tg_task_audit();


create or replace function tg_comment_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_task tasks;
begin
  select * into v_task from tasks where id = new.task_id;

  -- 멘션된 사람
  insert into notifications (user_id, type, task_id, project_id, actor_id)
  select m, 'task_mentioned', new.task_id, v_task.project_id, new.user_id
  from unnest(new.mentions) as m
  where m <> new.user_id;

  -- 담당자 (멘션 중복 제외)
  if v_task.assignee_id is not null
     and v_task.assignee_id <> new.user_id
     and not (v_task.assignee_id = any(new.mentions)) then
    insert into notifications (user_id, type, task_id, project_id, actor_id)
    values (v_task.assignee_id, 'task_commented', new.task_id, v_task.project_id, new.user_id);
  end if;
  return null;
end $$;

create trigger comment_created after insert on comments
  for each row execute function tg_comment_created();

-- ─────────────────────────────────────────────────────────────
-- 5.3 담당자 이탈 처리 (US-204)
--     status 는 유지한다. todo 로 초기화하면 "처음부터 다시" 라는
--     잘못된 신호를 준다 (User Flow §7)
-- ─────────────────────────────────────────────────────────────

create or replace function tg_member_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update tasks
     set assignee_id = null, updated_at = now()
   where project_id = old.project_id
     and assignee_id = old.user_id
     and status <> 'done'          -- 완료 Task 의 담당자는 기록이므로 유지 (EC-4)
     and deleted_at is null;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into notifications (user_id, type, project_id, actor_id, payload)
    select pm.user_id, 'tasks_unassigned', old.project_id, auth.uid(),
           jsonb_build_object('count', v_count, 'left_user', old.user_id)
    from project_members pm
    where pm.project_id = old.project_id and pm.role = 'lead';
  end if;

  return old;
end $$;

create trigger member_removed after delete on project_members
  for each row execute function tg_member_removed();

-- ─────────────────────────────────────────────────────────────
-- 5.4 마지막 Lead / Owner 보호 (EC-1, EC-14)
-- ─────────────────────────────────────────────────────────────

create or replace function tg_guard_last_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_leads int;
begin
  if old.role <> 'lead' then
    return coalesce(new, old);
  end if;

  select count(*) into v_leads
  from project_members where project_id = old.project_id and role = 'lead';

  if v_leads <= 1 and (tg_op = 'DELETE' or new.role <> 'lead') then
    raise exception 'LAST_LEAD: 프로젝트에는 최소 1명의 Lead 가 필요합니다';
  end if;

  return coalesce(new, old);
end $$;

create trigger guard_last_lead before update or delete on project_members
  for each row execute function tg_guard_last_lead();


create or replace function tg_guard_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owners int;
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  select count(*) into v_owners
  from memberships where workspace_id = old.workspace_id and role = 'owner';

  if v_owners <= 1 and (tg_op = 'DELETE' or new.role <> 'owner') then
    raise exception 'LAST_OWNER: 워크스페이스에는 최소 1명의 Owner 가 필요합니다';
  end if;

  return coalesce(new, old);
end $$;

create trigger guard_last_owner before update or delete on memberships
  for each row execute function tg_guard_last_owner();

-- ─────────────────────────────────────────────────────────────
-- 5.5 부트스트랩 — 워크스페이스 / 프로젝트 생성 시 (D-023, D-016e)
-- ─────────────────────────────────────────────────────────────

create or replace function tg_workspace_bootstrap()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  insert into memberships (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  insert into projects (workspace_id, name, is_personal, created_by)
  values (new.id, '개인 업무', true, new.created_by)
  returning id into v_project;

  return new;
end $$;

create trigger workspace_bootstrap after insert on workspaces
  for each row execute function tg_workspace_bootstrap();


create or replace function tg_project_bootstrap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into project_members (project_id, user_id, role)
  values (new.id, new.created_by, 'lead')
  on conflict do nothing;
  return null;
end $$;

create trigger project_bootstrap after insert on projects
  for each row execute function tg_project_bootstrap();
