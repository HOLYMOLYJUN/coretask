-- core_task · 22 Task soft delete (US-302 AC-3·4)
--
-- 삭제 = deleted_at 세우기. tasks_read RLS 가 deleted_at is null 이므로
-- 세우는 순간 모든 조회에서 사라진다. 10초 Undo = 다시 null 로 되돌리기.
-- (UPDATE 정책은 deleted_at 을 보지 않으므로 삭제된 행도 되돌릴 수 있다)
--
-- 권한 (US-302 AC-3): PJ Lead. 본인이 만들었고 아직 미배정이면 만든 사람도.
-- 기존 tg_task_validate/audit 를 다시 쓰지 않고 전용 트리거로 분리한다 —
-- WHEN 조건으로 deleted_at 변경에만 깨어나므로 기존 경로 비용이 늘지 않는다.

create or replace function tg_task_delete_validate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (
    is_project_lead(new.project_id)
    or (old.created_by = auth.uid() and old.assignee_id is null)
  ) then
    raise exception 'FORBIDDEN: 삭제는 Lead 권한입니다 (본인이 만든 미배정 업무는 예외)';
  end if;
  return new;
end $$;

create trigger task_delete_validate before update on tasks
  for each row
  when (new.deleted_at is distinct from old.deleted_at)
  execute function tg_task_delete_validate();

create or replace function tg_task_delete_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor      uuid := auth.uid();
  v_admin_only boolean;
begin
  select (not exists (
           select 1 from project_members
           where project_id = new.project_id and user_id = v_actor and role = 'lead'
         ))
         and is_project_lead(new.project_id)
    into v_admin_only;

  insert into activities (task_id, user_id, type, via_admin)
  values (new.id, v_actor,
          (case when new.deleted_at is null then 'restored' else 'deleted' end)::activity_type,
          v_admin_only);
  return null;
end $$;

create trigger task_delete_audit after update on tasks
  for each row
  when (new.deleted_at is distinct from old.deleted_at)
  execute function tg_task_delete_audit();
