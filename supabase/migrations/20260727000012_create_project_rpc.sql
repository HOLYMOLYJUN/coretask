-- core_task · 12 create_project RPC
-- 근거: docs/06-API.md §4 원칙 — "한 번의 사용자 행동이 여러 테이블을
--       원자적으로 바꿔야 할 때만 RPC 로 만든다"
--
-- ⚠️ 이 함수가 필요한 이유 (구현 중 발견)
--
-- 클라이언트가 `insert().select()` 를 쓰면 PostgREST 는 return=representation 을 보내고,
-- 그러면 INSERT 시점에 **SELECT 정책까지** 통과해야 한다.
-- 그런데 projects_read 는 is_project_member(id) 를 보고, 그 근거인 project_members 행은
-- project_bootstrap(AFTER INSERT) 트리거가 만든다. RETURNING 검사 시점에는 아직 없다.
-- WS Admin 분기도 projects 테이블을 다시 조회하므로 같은 이유로 실패한다.
--   → 42501 new row violates row-level security policy for table "projects"
--
-- security definer 안에서는 RLS 를 우회하므로 생성과 반환이 한 번에 끝난다.
-- 프로젝트 생성은 projects + project_members 두 행을 만드는 행위이므로
-- 애초에 §4 의 RPC 조건에 정확히 해당한다.

create or replace function create_project(
  p_name        text,
  p_description text          default null,
  p_customer    text          default null,
  p_start_date  date          default null,
  p_end_date    date          default null,
  p_priority    task_priority default 'normal'
)
returns projects
language plpgsql security definer set search_path = public as $$
declare
  v_ws  uuid;
  v_row projects;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  v_ws := current_workspace_id();
  if v_ws is null then raise exception 'NO_WORKSPACE'; end if;

  -- 프로젝트 생성은 워크스페이스 Admin 권한이다 (PRD §4)
  if not is_workspace_admin(v_ws) then raise exception 'FORBIDDEN'; end if;

  insert into projects (
    workspace_id, name, description, customer,
    start_date, end_date, priority, created_by
  )
  values (
    v_ws, p_name, nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_customer, '')), ''),
    p_start_date, p_end_date, p_priority, auth.uid()
  )
  returning * into v_row;

  -- project_bootstrap 트리거가 생성자를 Lead 로 넣는다 (D-016e)
  return v_row;
end $$;

grant execute on function create_project(text, text, text, date, date, task_priority)
  to authenticated;
