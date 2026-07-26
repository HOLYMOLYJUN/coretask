-- core_task · 17 `개인 업무` 를 워크스페이스당 1개 → 사람당 1개로
--
-- ⚠️ 문제
--   D-023 은 `개인 업무` 를 "프로젝트 없이 업무를 적을 수 있는 도피처" 로 정의했다.
--   그런데 워크스페이스당 1개만 만들고 생성자만 멤버로 넣어서,
--   **워크스페이스를 만든 사람에게만 도피처가 있었다.**
--   나중에 합류한 팀원은 개인 업무 프로젝트가 아예 보이지 않는다.
--
--   "개인" 이라는 이름과 "워크스페이스당 1개" 라는 제약이 애초에 맞지 않았다.
--
-- ⚠️ 대안 검토
--   (a) 하나를 전원이 공유    → 남의 개인 업무가 다 보인다. 개인이 아니다
--   (b) 아예 없앤다          → D-014 의 "미분류 도피처" 근거가 사라진다
--   (c) 사람당 1개  ← 채택   → 이름과 의도가 일치하고 RLS 로 자연히 격리된다
--
-- ⚠️ 결과
--   각자 자기 `개인 업무` 의 Lead 다. 남의 것은 project_members 에 없으므로 보이지 않는다.

-- 워크스페이스당 1개 → (워크스페이스, 만든 사람) 당 1개
drop index if exists projects_one_personal;
create unique index projects_one_personal
  on projects (workspace_id, created_by) where is_personal and deleted_at is null;

-- 워크스페이스 부트스트랩에서는 멤버십만 만든다.
-- 개인 업무 생성은 아래 멤버십 트리거가 전담한다 (합류 경로가 하나로 모인다).
create or replace function tg_workspace_bootstrap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into memberships (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end $$;

-- 누가 워크스페이스에 들어오든 개인 업무 프로젝트를 하나 갖는다.
-- (워크스페이스 생성자든, 초대로 합류한 팀원이든 같은 경로를 탄다)
create or replace function tg_membership_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into projects (workspace_id, name, is_personal, created_by)
  values (new.workspace_id, '개인 업무', true, new.user_id)
  on conflict do nothing;
  -- projects AFTER INSERT 트리거(project_bootstrap)가 생성자를 Lead 로 넣는다
  return null;
end $$;

drop trigger if exists membership_created on memberships;
create trigger membership_created after insert on memberships
  for each row execute function tg_membership_created();

-- 기존 멤버 중 개인 업무가 없는 사람에게 만들어 준다
insert into projects (workspace_id, name, is_personal, created_by)
select m.workspace_id, '개인 업무', true, m.user_id
from memberships m
where not exists (
  select 1 from projects p
  where p.workspace_id = m.workspace_id
    and p.created_by = m.user_id
    and p.is_personal
    and p.deleted_at is null
);
