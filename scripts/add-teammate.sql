-- core_task — 팀원 계정을 내 워크스페이스에 직접 합류시킨다
--
-- 초대 기능(US-102)이 아직 없어서 쓰는 임시 수단이다.
--
-- 순서
--   1. 앱에서 로그아웃 → 새 계정으로 가입
--   2. "워크스페이스 만들기" 화면이 나오면 거기서 멈춘다 (만들지 않는다)
--   3. Supabase 대시보드 > SQL Editor 에 아래 블록을 do $$ 부터 end $$; 까지 통째로 붙여넣는다
--      (declare 줄만 따로 붙이면 syntax error 가 난다)
--   4. 브라우저 새로고침

-- ⚠️ 워크스페이스 이름을 반드시 적는다.
--
-- 한때 "다른 사람이 속한 워크스페이스를 자동으로 찾기" 로 만들었다가 사고가 났다.
-- 검증 스크립트가 남긴 `테스트 회사` 워크스페이스가 여러 개 있었고
-- ORDER BY 없는 limit 1 이 그중 하나를 집어, 팀원이 조용히 엉뚱한 회사에 합류했다.
-- 오타를 막으려다 "틀린 곳에 조용히 들어가는" 더 나쁜 실패를 만든 셈이다.
-- 이름을 틀리면 예외가 나서 시끄럽게 실패한다 — 그쪽이 낫다.

do $$
declare
  ---------------------------------------------------------------
  v_email     text         := 'test2@naver.com';  -- ← 추가할 계정
  v_workspace text         := '코어플랫폼';        -- ← 합류시킬 워크스페이스 (정확히)
  v_role      project_role := 'member';           -- 'member' | 'lead'
  ---------------------------------------------------------------
  v_user uuid;
  v_ws   uuid;
  v_n    int;
begin
  select id into v_user from auth.users where email = v_email;
  if v_user is null then
    raise exception 'auth.users 에 % 가 없습니다. 앱에서 먼저 가입하세요.', v_email;
  end if;

  select id into v_ws from workspaces where name = v_workspace;
  if v_ws is null then
    raise exception '워크스페이스 "%" 를 찾을 수 없습니다. 이름을 확인하세요: %',
      v_workspace, (select string_agg(name, ', ') from workspaces);
  end if;

  -- 잘못된 워크스페이스에 있으면 빼낸다.
  -- D-022 가 1인 1워크스페이스이므로 옮기려면 먼저 나와야 한다.
  if exists (select 1 from memberships where user_id = v_user and workspace_id <> v_ws) then
    delete from project_members where user_id = v_user;
    delete from memberships     where user_id = v_user;
    raise notice '다른 워크스페이스에서 빼냈습니다';
  end if;

  insert into memberships (workspace_id, user_id, role)
  values (v_ws, v_user, 'member')
  on conflict (workspace_id, user_id) do nothing;

  -- `개인 업무` 를 제외한 모든 활성 프로젝트에 참여시킨다
  insert into project_members (project_id, user_id, role)
  select p.id, v_user, v_role
  from projects p
  where p.workspace_id = v_ws
    and p.status = 'active'
    and not p.is_personal
    and p.deleted_at is null
  on conflict (project_id, user_id) do nothing;

  get diagnostics v_n = row_count;
  raise notice '완료: % → 워크스페이스 "%", 프로젝트 %개에 % 로 참여',
    v_email, v_name, v_n, v_role;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 확인용 — 누가 어디에 속해 있나
-- ─────────────────────────────────────────────────────────────
-- select u.email, w.name as workspace, m.role as ws_role,
--        p.name as project, pm.role as pj_role
-- from auth.users u
-- left join memberships m     on m.user_id = u.id
-- left join workspaces w      on w.id = m.workspace_id
-- left join project_members pm on pm.user_id = u.id
-- left join projects p        on p.id = pm.project_id
-- order by u.email, p.name;


-- ─────────────────────────────────────────────────────────────
-- 정리 블록 — 그 계정이 실수로 워크스페이스를 만들었을 때만 실행
--
-- ⚠️ 그 계정이 만든 워크스페이스와 그 안의 프로젝트·업무가 전부 삭제된다.
--    테스트 계정에만 쓴다.
-- ─────────────────────────────────────────────────────────────
/*
do $$
declare
  v_email text := 'test2@naver.com';   -- ← 정리할 계정
  v_user uuid; v_ws uuid;
begin
  select id into v_user from auth.users where email = v_email;
  select workspace_id into v_ws from memberships where user_id = v_user;
  if v_ws is null then raise notice '소속 워크스페이스 없음'; return; end if;

  if exists (select 1 from workspaces where id = v_ws and created_by = v_user) then
    delete from workspaces where id = v_ws;   -- cascade 로 하위 전부 삭제
    raise notice '워크스페이스 삭제 완료';
  else
    delete from memberships where user_id = v_user;
    raise notice '멤버십만 해제 (남의 워크스페이스라 삭제하지 않음)';
  end if;
end $$;
*/
