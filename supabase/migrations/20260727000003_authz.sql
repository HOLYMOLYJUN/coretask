-- core_task · 03 authz
-- 근거: docs/05-DB.md §5
--
-- ⚠️ security definer 가 필수다.
-- project_members 의 RLS 정책이 project_members 를 조회하면 무한 재귀가 난다.
-- definer 로 RLS 를 우회해야 재귀가 끊긴다. search_path 고정은 보안상 필수.
--
-- 이 파일은 반드시 04_rls.sql 보다 먼저 실행되어야 한다 (정책이 이 함수를 참조한다).

create or replace function current_workspace_id()
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from memberships where user_id = auth.uid()
$$;

create or replace function is_workspace_admin(p_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and workspace_id = p_workspace
      and role in ('admin', 'owner')
  )
$$;

-- 프로젝트 조회 자격
create or replace function is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = p_project and pm.user_id = auth.uid()
  )
  or exists (
    -- D-016d: WS Admin 은 모든 프로젝트에 접근한다
    select 1 from projects p
    join memberships m on m.workspace_id = p.workspace_id
    where p.id = p_project
      and m.user_id = auth.uid()
      and m.role in ('admin', 'owner')
  )
$$;

-- 배정 · 완료확정 · 프로젝트 관리 자격
create or replace function is_project_lead(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = p_project
      and pm.user_id = auth.uid()
      and pm.role = 'lead'
  )
  or exists (
    select 1 from projects p
    join memberships m on m.workspace_id = p.workspace_id
    where p.id = p_project
      and m.user_id = auth.uid()
      and m.role in ('admin', 'owner')
  )
$$;

-- Task 기준 축약형
create or replace function can_read_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_project_member((select project_id from tasks where id = p_task))
$$;

create or replace function can_lead_task(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_project_lead((select project_id from tasks where id = p_task))
$$;

-- ─────────────────────────────────────────────────────────────
-- 가입 시 프로필 자동 생성
-- ⚠️ 설계 문서에 없던 필수 항목. 이게 없으면 workspaces.created_by 가
--    profiles(id) 를 참조하지 못해 워크스페이스 생성이 FK 오류로 실패한다.
-- ─────────────────────────────────────────────────────────────

create or replace function tg_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function tg_handle_new_user();
