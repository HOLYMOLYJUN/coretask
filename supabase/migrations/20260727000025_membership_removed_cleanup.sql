-- core_task · 25 워크스페이스 이탈 시 프로젝트 소속 정리 (US-1001 AC-4 · EC-3)
--
-- ⚠️ 구멍
--   memberships 를 지워도 project_members 는 그대로 남는다 (FK 도 트리거도 없었다).
--   is_project_member() 는 project_members 를 직접 보므로,
--   워크스페이스에서 제거된 사람이 **그 프로젝트의 업무를 계속 읽을 수 있었다.**
--   지금은 제거 UI 가 없어 도달 불가능하지만, 설정 화면이 생기는 순간 살아난다.
--
-- ⚠️ 순서가 중요하다
--   1. 개인 업무 프로젝트를 먼저 지운다.
--      그 사람이 자기 개인 프로젝트의 유일한 Lead 이므로, 이걸 남겨두면
--      2단계에서 tg_guard_last_lead 가 LAST_LEAD 로 막아 제거 자체가 불가능해진다.
--      (부모가 사라지면 가드는 건너뛴다 — 마이그레이션 16)
--   2. 남은(공유) 프로젝트에서 뺀다 → tg_member_removed 가 담당 업무를
--      미배정으로 돌리고 Lead 에게 알린다 (US-204).
--
-- 공유 프로젝트의 마지막 Lead 라면 LAST_LEAD 로 막힌다. 의도된 것이다 —
-- 주인 없는 프로젝트를 만드는 것보다 Lead 를 먼저 넘기게 하는 편이 낫다.

create or replace function tg_membership_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from projects
   where workspace_id = old.workspace_id
     and created_by   = old.user_id
     and is_personal;

  delete from project_members pm
   using projects p
   where pm.project_id = p.id
     and p.workspace_id = old.workspace_id
     and pm.user_id     = old.user_id;

  return old;
end $$;

create trigger membership_removed after delete on memberships
  for each row execute function tg_membership_removed();
