-- core_task · 23 삭제/복구를 RPC 로 (US-302 AC-4)
--
-- ⚠️ 증상
--   update tasks set deleted_at = now()
--   → "new row violates row-level security policy for table tasks"
--
-- ⚠️ 원인
--   PostgREST 는 UPDATE 를 항상 RETURNING 과 함께 보낸다.
--   RETURNING 이 붙으면 SELECT 정책이 **변경 후의 행**에도 적용된다.
--   tasks_read 는 `deleted_at is null` 이므로, 방금 삭제한 행은
--   그 SELECT 검사를 통과할 수 없다 → 삭제가 원천적으로 불가능하다.
--   복구도 같은 이유로 막힌다 (삭제된 행은 애초에 조회되지 않는다).
--
-- ⚠️ 해결
--   tasks_read 를 무르게 하지 않는다 — 그러면 모든 목록 질의에
--   삭제된 업무가 새어 들어온다. 대신 security definer RPC 로 우회한다.
--   권한 판정과 활동 기록은 그대로 트리거(22)가 하므로 규칙은 한 곳에만 있다.

create or replace function delete_task(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update tasks set deleted_at = now()
   where id = p_task and deleted_at is null;
  if not found then
    raise exception 'TASK_NOT_FOUND: 업무를 찾을 수 없습니다';
  end if;
end $$;

create or replace function restore_task(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update tasks set deleted_at = null
   where id = p_task and deleted_at is not null;
  if not found then
    raise exception 'TASK_NOT_FOUND: 업무를 찾을 수 없습니다';
  end if;
end $$;

-- ⚠️ security definer 는 RLS 를 지나친다. 함수 안에서 권한을 확인해야 한다.
--    여기서는 tg_task_delete_validate (22) 가 그 역할을 한다 —
--    트리거는 RLS 우회 여부와 무관하게 항상 실행되고, auth.uid() 도 그대로 보인다.

grant execute on function delete_task(uuid)  to authenticated;
grant execute on function restore_task(uuid) to authenticated;
