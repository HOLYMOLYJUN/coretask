-- core_task · 16 cascade 삭제가 불변식 가드에 막히는 문제
--
-- ⚠️ 증상
--   delete from workspaces ...
--   → cascade 로 memberships 삭제
--   → tg_guard_last_owner 가 "최소 1명의 Owner 가 필요합니다" 로 거부
--
--   delete from projects ...  (US-205 보관 후 삭제)
--   → cascade 로 project_members 삭제
--   → tg_guard_last_lead 가 "최소 1명의 Lead 가 필요합니다" 로 거부
--
-- ⚠️ 원인
--   두 가드는 "사람이 멤버를 빼거나 강등하는" 상황을 막으려고 만든 것이다.
--   그런데 부모(workspace / project)가 통째로 사라지는 cascade 에서도 똑같이 발동한다.
--   그 순간 "최소 1명" 이라는 불변식은 지킬 대상 자체가 없어진 상태다.
--
--   → 이대로면 **워크스페이스도 프로젝트도 영원히 삭제할 수 없다.**
--     US-205 가 정의한 "보관 후 삭제" 가 동작하지 않는다.
--
-- ⚠️ 해결
--   부모 행이 이미 사라졌으면 검사를 건너뛴다.
--   cascade 는 부모를 지운 뒤 자식으로 내려오므로, 이 시점에 부모는 조회되지 않는다.
--   일반적인 멤버 제거에서는 부모가 그대로 있으므로 가드는 정상 동작한다.

create or replace function tg_guard_last_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_leads int;
begin
  -- 프로젝트가 통째로 지워지는 중이면 지킬 불변식이 없다
  if not exists (select 1 from projects where id = old.project_id) then
    return old;
  end if;

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


create or replace function tg_guard_last_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owners int;
begin
  -- 워크스페이스가 통째로 지워지는 중이면 지킬 불변식이 없다
  if not exists (select 1 from workspaces where id = old.workspace_id) then
    return old;
  end if;

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


-- 같은 이유로, 프로젝트가 사라지는 중이면 이탈 정리도 할 일이 없다.
-- (업무도 함께 cascade 로 지워진다)
create or replace function tg_member_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not exists (select 1 from projects where id = old.project_id) then
    return old;
  end if;

  update tasks
     set assignee_id = null, updated_at = now()
   where project_id = old.project_id
     and assignee_id = old.user_id
     and status <> 'done'          -- 완료 Task 의 담당자는 기록이므로 유지 (EC-4)
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
