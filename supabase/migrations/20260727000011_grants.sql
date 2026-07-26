-- core_task · 11 grants
-- 근거: docs/05-DB.md §10-A (D-043)
--
-- 프로젝트 생성 시 "Automatically expose new tables" 를 껐으므로 명시적으로 부여한다.
--
-- GRANT 와 RLS 는 다른 층이다:
--   GRANT = 이 역할이 이 테이블을 건드릴 수 있는가
--   RLS   = 그중 어떤 행을 볼 수 있는가
-- 둘 다 통과해야 데이터가 나온다. 이 파일이 권한을 무르게 만드는 것이 아니다.
--
-- ⚠️ 반드시 마지막에 실행한다. 테이블·뷰·함수가 전부 존재해야 한다.

grant usage on schema public to anon, authenticated;

-- 로그인 사용자. 행 단위 통제는 RLS 정책이 전담한다
grant select, insert, update, delete on
  profiles, workspaces, memberships,
  projects, project_members,
  tasks, comments, notifications,
  documents, invitations, push_subscriptions
to authenticated;

-- activities 는 읽기 전용. 쓰기는 security definer 트리거만 한다.
-- 클라이언트가 활동 로그를 위조할 수 없어야 하기 때문이다 (04_rls.sql 참조)
grant select on activities to authenticated;

-- 뷰 (security_invoker = true 이므로 기반 테이블 RLS 가 그대로 적용된다)
grant select on v_tasks_enriched, v_project_stats, v_my_lead_projects to authenticated;

-- RPC (09_rpc.sql)
grant execute on function create_workspace(text)                  to authenticated;
grant execute on function accept_invitation(text)                 to authenticated;
grant execute on function move_task(uuid, uuid, uuid, uuid, date) to authenticated;
grant execute on function reject_task(uuid, text)                 to authenticated;
grant execute on function claim_task(uuid, date)                  to authenticated;
grant execute on function preview_member_removal(uuid, uuid)      to authenticated;

-- 권한 판정 함수 (03_authz.sql) — 정책과 뷰 내부에서 호출된다
grant execute on function current_workspace_id()   to authenticated;
grant execute on function is_workspace_admin(uuid) to authenticated;
grant execute on function is_project_member(uuid)  to authenticated;
grant execute on function is_project_lead(uuid)    to authenticated;
grant execute on function can_read_task(uuid)      to authenticated;
grant execute on function can_lead_task(uuid)      to authenticated;

-- ⚠️ anon 에는 public 스키마의 테이블 권한을 하나도 주지 않는다.
-- 로그인 전에 필요한 것은 가입·로그인뿐이고 그건 auth 스키마가 처리한다.
-- 초대 수락(accept_invitation)도 로그인 후에 일어난다 — auth.uid() 가 필요하기 때문이다.
-- 즉 비로그인 상태에서 우리 데이터에 닿을 수 있는 표면적이 0이다.
