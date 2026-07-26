-- core_task · 04 rls
-- 근거: docs/05-DB.md §6 (D-036 반영)
--
-- 원칙: 정책은 절대 project_members 를 직접 조인하지 않는다.
--       03_authz.sql 의 함수만 호출한다.

alter table profiles           enable row level security;
alter table workspaces         enable row level security;
alter table memberships        enable row level security;
alter table projects           enable row level security;
alter table project_members    enable row level security;
alter table tasks              enable row level security;
alter table comments           enable row level security;
alter table activities         enable row level security;
alter table notifications      enable row level security;
alter table documents          enable row level security;
alter table invitations        enable row level security;
alter table push_subscriptions enable row level security;

-- ─────────────────────────────────────────────────────────────
-- profiles · workspaces · memberships
-- ─────────────────────────────────────────────────────────────

-- 같은 워크스페이스 사람은 서로 볼 수 있다.
-- 근거: Team 메뉴를 없앤 대신 "우리 회사에 누가 있지"를 볼 곳은 남겨야 한다 (IA §3.8)
create policy profiles_read on profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from memberships m1, memberships m2
    where m1.user_id = auth.uid()
      and m2.user_id = profiles.id
      and m1.workspace_id = m2.workspace_id
  )
);
create policy profiles_write on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy workspaces_read on workspaces for select
  using (id = current_workspace_id());
create policy workspaces_write on workspaces for update
  using (exists (select 1 from memberships
                 where user_id = auth.uid()
                   and workspace_id = workspaces.id
                   and role = 'owner'));

create policy memberships_read on memberships for select
  using (workspace_id = current_workspace_id());
create policy memberships_manage on memberships for all
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

-- ─────────────────────────────────────────────────────────────
-- projects · project_members
-- ─────────────────────────────────────────────────────────────

create policy projects_read on projects for select
  using (deleted_at is null and is_project_member(id));

create policy projects_insert on projects for insert
  with check (is_workspace_admin(workspace_id) and created_by = auth.uid());

create policy projects_update on projects for update
  using (is_project_lead(id)) with check (is_project_lead(id));

-- 삭제는 보관된 프로젝트만, 개인 업무는 불가 (US-205, EC-13)
create policy projects_delete on projects for delete
  using (is_project_lead(id) and status = 'archived' and not is_personal);

create policy pm_read on project_members for select
  using (is_project_member(project_id));
create policy pm_manage on project_members for all
  using (is_project_lead(project_id))
  with check (is_project_lead(project_id));

-- ─────────────────────────────────────────────────────────────
-- tasks
--
-- ⚠️ 이 정책들이 느슨해 보이는 것은 의도적이다.
--    "누가 이 행을 만질 자격이 있는가" 까지만 RLS 가 본다.
--    "이 변화가 적법한가" (상태 전이 · 배정 규칙) 는 05_triggers.sql 이 판정한다.
--    두 겹 모두 필요하다.
-- ─────────────────────────────────────────────────────────────

create policy tasks_read on tasks for select
  using (deleted_at is null and is_project_member(project_id));

create policy tasks_insert on tasks for insert
  with check (is_project_member(project_id) and created_by = auth.uid());

create policy tasks_update on tasks for update
  using (is_project_member(project_id))
  with check (is_project_member(project_id));

create policy tasks_delete on tasks for delete
  using (is_project_lead(project_id));

-- ─────────────────────────────────────────────────────────────
-- comments · activities · notifications
-- ─────────────────────────────────────────────────────────────

create policy comments_read on comments for select
  using (can_read_task(task_id));
create policy comments_insert on comments for insert
  with check (can_read_task(task_id) and user_id = auth.uid());
create policy comments_update on comments for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comments_delete on comments for delete
  using (user_id = auth.uid() or can_lead_task(task_id));

create policy activities_read on activities for select
  using (can_read_task(task_id));
-- activities 에 INSERT 정책은 없다.
-- 기록은 security definer 트리거만 남긴다 = 클라이언트가 활동 로그를 위조할 수 없다.

create policy notif_read on notifications for select using (user_id = auth.uid());
create policy notif_update on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- documents · invitations · push_subscriptions
-- ─────────────────────────────────────────────────────────────

create policy docs_read on documents for select
  using (is_project_member(project_id));
create policy docs_insert on documents for insert
  with check (is_project_member(project_id) and created_by = auth.uid());
create policy docs_update on documents for update
  using (created_by = auth.uid() or is_project_lead(project_id));
create policy docs_delete on documents for delete
  using (created_by = auth.uid() or is_project_lead(project_id));

create policy inv_read on invitations for select
  using (is_workspace_admin(workspace_id));
create policy inv_manage on invitations for all
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

create policy push_own on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
