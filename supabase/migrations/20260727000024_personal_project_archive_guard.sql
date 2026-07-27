-- core_task · 24 개인 업무 프로젝트 보관 차단 (US-205 AC-5 · EC-13)
--
-- 삭제는 projects_delete 정책이 `not is_personal` 로 막고 있었지만,
-- 보관(status = 'archived')에는 아무 가드가 없었다.
-- 개인 업무를 보관하면 목록에서 사라지는데 워크스페이스당 1개뿐이라
-- 다시 만들 수도 없다 (projects_one_personal unique index).

create or replace function tg_guard_personal_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_personal and new.status = 'archived' and old.status <> 'archived' then
    raise exception 'PERSONAL_PROJECT: 개인 업무는 보관할 수 없습니다';
  end if;
  return new;
end $$;

create trigger guard_personal_project before update on projects
  for each row execute function tg_guard_personal_project();
