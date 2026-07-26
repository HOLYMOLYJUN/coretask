-- core_task · 19 `개인 업무` 는 관리자의 열람 대상이 아니다
--
-- ⚠️ 문제
--   마이그레이션 17이 개인 업무를 사람당 1개로 만들며
--   "남의 것은 project_members 에 없으므로 보이지 않는다" 고 가정했다.
--   그러나 WS Admin 은 D-016d 로 모든 프로젝트에 접근하므로
--   관리자에게 팀원 전원의 개인 업무가 보였다. "개인" 이 아니게 된 것이다.
--
-- 해결
--   Admin 의 전체 접근(branch 2)에서 개인 업무만 제외한다.
--   본인의 개인 업무는 project_members(lead) 행으로 접근하므로(branch 1) 영향이 없다.
--   권한이 이 함수 2개로 단일화되어 있어(DB §5) RLS·뷰·트리거가 한 번에 고쳐진다.
--
-- D-016d 보정: "Admin 은 모든 프로젝트에서 Lead 권한" — 개인 업무는 예외다.
--   데드락 걱정은 없다: 개인 업무의 Lead 는 항상 그 주인이고,
--   주인이 나가면 그 프로젝트는 존재 이유가 없다.

create or replace function is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = p_project and pm.user_id = auth.uid()
  )
  or exists (
    select 1 from projects p
    join memberships m on m.workspace_id = p.workspace_id
    where p.id = p_project
      and m.user_id = auth.uid()
      and m.role in ('admin', 'owner')
      and not p.is_personal          -- 개인 업무는 관리자 열람 대상이 아니다
  )
$$;

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
      and not p.is_personal
  )
$$;

-- "전체 보기" 범위에서도 남의 개인 업무를 뺀다
create or replace view v_my_lead_projects as
select p.*
from projects p
where p.deleted_at is null
  and p.status = 'active'
  and (
    exists (select 1 from project_members pm
            where pm.project_id = p.id and pm.user_id = auth.uid() and pm.role = 'lead')
    or (is_workspace_admin(p.workspace_id) and not p.is_personal)
  );

alter view v_my_lead_projects set (security_invoker = true);
grant select on v_my_lead_projects to authenticated;
