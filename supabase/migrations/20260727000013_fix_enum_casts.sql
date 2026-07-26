-- core_task · 13 enum 캐스팅 수정
--
-- ⚠️ 구현 중 발견한 버그
--
-- CASE 식은 결과 타입을 text 로 확정한다. Postgres 는 text -> enum 의
-- 암묵적 캐스팅을 허용하지 않으므로 아래에서 실패했다:
--
--   column "type" is of type activity_type but expression is of type text
--
-- 증상: 담당자 변경 트리거 전체가 중단 → 배정·가져가기·배정알림이 모두 실패.
-- 단독 리터럴('created' 등)은 unknown 타입이라 대상 컬럼 타입으로 해석되어 통과했기 때문에
-- 생성·상태변경 경로만 정상 동작해 원인이 가려져 있었다.
--
-- 조치: enum 이 들어가는 모든 자리에 명시적 캐스팅을 건다.

create or replace function tg_task_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_admin_only boolean;
  v_actor      uuid := auth.uid();
begin
  -- WS Admin 이면서 프로젝트 Lead 가 아닌 경우 = 관리자 권한 개입 (D-016d)
  select (not exists (
           select 1 from project_members
           where project_id = new.project_id and user_id = v_actor and role = 'lead'
         ))
         and is_project_lead(new.project_id)
    into v_admin_only;

  -- ── 담당자 변경 ────────────────────────────────────────────
  if new.assignee_id is distinct from old.assignee_id then
    insert into activities (task_id, user_id, type, payload, via_admin)
    values (
      new.id, v_actor,
      (case when new.assignee_id is null then 'unassigned' else 'assigned' end)::activity_type,
      jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id),
      v_admin_only
    );

    -- US-801 AC-2: 본인이 일으킨 이벤트는 본인에게 알리지 않는다
    if new.assignee_id is not null and new.assignee_id is distinct from v_actor then
      insert into notifications (user_id, type, task_id, project_id, actor_id)
      values (new.assignee_id, 'task_assigned'::notification_type,
              new.id, new.project_id, v_actor);
    end if;

    -- 팀원이 스스로 가져간 경우 Lead 에게 알린다 (US-403 AC-3)
    if new.assignee_id = v_actor and old.assignee_id is null then
      insert into notifications (user_id, type, task_id, project_id, actor_id, payload)
      select pm.user_id, 'task_assigned'::notification_type,
             new.id, new.project_id, v_actor,
             jsonb_build_object('claimed', true)
      from project_members pm
      where pm.project_id = new.project_id
        and pm.role = 'lead'
        and pm.user_id is distinct from v_actor;
    end if;
  end if;

  -- ── 상태 변경 ──────────────────────────────────────────────
  if new.status is distinct from old.status then
    insert into activities (task_id, user_id, type, payload, via_admin)
    values (new.id, v_actor, 'status_changed'::activity_type,
            jsonb_build_object('from', old.status, 'to', new.status), v_admin_only);

    -- 리뷰 요청 -> 그 프로젝트 Lead 전원 (D-017)
    if new.status = 'in_review' then
      insert into notifications (user_id, type, task_id, project_id, actor_id)
      select pm.user_id, 'review_requested'::notification_type,
             new.id, new.project_id, v_actor
      from project_members pm
      where pm.project_id = new.project_id
        and pm.role = 'lead'
        and pm.user_id is distinct from v_actor;
    end if;

    -- 완료 확정 / 반려 -> 담당자
    if new.assignee_id is not null and new.assignee_id is distinct from v_actor then
      if new.status = 'done' then
        insert into notifications (user_id, type, task_id, project_id, actor_id)
        values (new.assignee_id, 'task_completed'::notification_type,
                new.id, new.project_id, v_actor);
      elsif old.status = 'in_review' and new.status = 'in_progress' then
        insert into notifications (user_id, type, task_id, project_id, actor_id)
        values (new.assignee_id, 'task_rejected'::notification_type,
                new.id, new.project_id, v_actor);
      end if;
    end if;
  end if;

  -- ── 마감일 변경 ────────────────────────────────────────────
  if new.due_date is distinct from old.due_date then
    insert into activities (task_id, user_id, type, payload, via_admin)
    values (new.id, v_actor, 'due_changed'::activity_type,
            jsonb_build_object('from', old.due_date, 'to', new.due_date), v_admin_only);
  end if;

  return null;
end $$;


create or replace function tg_task_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into activities (task_id, user_id, type)
  values (new.id, new.created_by, 'created'::activity_type);

  if new.assignee_id is not null and new.assignee_id is distinct from new.created_by then
    insert into notifications (user_id, type, task_id, project_id, actor_id)
    values (new.assignee_id, 'task_assigned'::notification_type,
            new.id, new.project_id, new.created_by);
  end if;
  return null;
end $$;


create or replace function tg_comment_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_task tasks;
begin
  select * into v_task from tasks where id = new.task_id;

  insert into notifications (user_id, type, task_id, project_id, actor_id)
  select m, 'task_mentioned'::notification_type,
         new.task_id, v_task.project_id, new.user_id
  from unnest(new.mentions) as m
  where m is distinct from new.user_id;

  if v_task.assignee_id is not null
     and v_task.assignee_id is distinct from new.user_id
     and not (v_task.assignee_id = any(new.mentions)) then
    insert into notifications (user_id, type, task_id, project_id, actor_id)
    values (v_task.assignee_id, 'task_commented'::notification_type,
            new.task_id, v_task.project_id, new.user_id);
  end if;
  return null;
end $$;


create or replace function tg_member_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update tasks
     set assignee_id = null, updated_at = now()
   where project_id = old.project_id
     and assignee_id = old.user_id
     and status <> 'done'
     and deleted_at is null;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into notifications (user_id, type, project_id, actor_id, payload)
    select pm.user_id, 'tasks_unassigned'::notification_type,
           old.project_id, auth.uid(),
           jsonb_build_object('count', v_count, 'left_user', old.user_id)
    from project_members pm
    where pm.project_id = old.project_id and pm.role = 'lead';
  end if;

  return old;
end $$;
