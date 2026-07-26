-- core_task · 15 멤버 이탈 시 자동 미배정이 권한 검사에 막히는 문제
--
-- ⚠️ 증상
--   delete from project_members ...
--   → tg_member_removed 가 담당 업무를 미배정으로 되돌림
--   → 그 UPDATE 가 tg_task_validate 를 깨움
--   → "미배정 업무를 본인에게만 가져올 수 있습니다" 로 거부
--
-- ⚠️ 원인
--   tg_task_validate 는 "지금 이 변경을 하는 사람이 Lead 인가" 를 묻는다.
--   그런데 이 UPDATE 는 사람이 아니라 시스템이 하는 정리 작업이다 (US-204).
--   제거 행위 자체는 이미 pm_manage 정책이 Lead 인지 확인했으므로,
--   그 결과인 미배정 전환을 다시 검사할 이유가 없다.
--
--   앱에서는 Lead 가 제거하니 우연히 통과했고, auth.uid() 가 NULL 인
--   SQL Editor 에서 처음 드러났다. 하지만 앱에도 잠재된 문제였다 —
--   워크스페이스 Admin 이 아닌 경로나 배치 작업이 생기면 그대로 터진다.
--
-- ⚠️ 해결
--   세션 플래그 대신 **데이터에서 유도되는 조건**으로 판별한다.
--   "담당자를 비우는데, 그 담당자가 이미 프로젝트 멤버가 아니다"
--   → 이건 이탈 정리 경로에서만 성립한다. 클라이언트가 위조할 수 없다
--     (그 상태를 만들려면 먼저 멤버를 제거해야 하고, 그건 Lead 권한이다).

create or replace function tg_task_validate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_lead   boolean := is_project_lead(new.project_id);
  v_cleanup   boolean;
begin
  -- 담당자 이탈에 따른 자동 미배정인가? (US-204 · tg_member_removed)
  v_cleanup :=
    new.assignee_id is null
    and old.assignee_id is not null
    and not exists (
      select 1 from project_members
      where project_id = new.project_id and user_id = old.assignee_id
    );

  if new.status is distinct from old.status then

    -- 리뷰 단계를 건너뛸 수 없다.
    -- 예외: 미배정 Task 는 Lead 가 바로 닫을 수 있다 (취소된 업무 정리, EC-8)
    if new.status = 'done'
       and old.status <> 'in_review'
       and not (v_is_lead and new.assignee_id is null) then
      raise exception 'INVALID_TRANSITION: % -> done. in_review 를 거쳐야 합니다', old.status;
    end if;

    if old.status = 'todo' and new.status = 'in_review' then
      raise exception 'INVALID_TRANSITION: 시작하지 않은 업무는 리뷰할 수 없습니다';
    end if;

    -- D-007: 완료 확정과 되돌리기는 Lead 만
    if (new.status = 'done' or old.status = 'done') and not v_is_lead then
      raise exception 'FORBIDDEN: 완료 확정은 Lead 권한입니다';
    end if;

    new.status_changed_at := now();
    new.completed_at := case when new.status = 'done' then now() else null end;

    -- D-021c: start_date 가 비어 있으면 실제 시작 시점을 기록
    if new.status = 'in_progress' and new.start_date is null then
      new.start_date := current_date;
    end if;
  end if;

  -- 배정 규칙 — 이탈 정리 경로는 건너뛴다
  if new.assignee_id is distinct from old.assignee_id and not v_cleanup then
    if not v_is_lead then
      -- US-403: 팀원은 "미배정 -> 본인" 만 가능 (가져가기)
      if not (old.assignee_id is null and new.assignee_id = auth.uid()) then
        raise exception 'FORBIDDEN: 미배정 업무를 본인에게만 가져올 수 있습니다';
      end if;
    end if;

    if new.assignee_id is not null
       and not exists (select 1 from project_members
                       where project_id = new.project_id and user_id = new.assignee_id) then
      raise exception 'INVALID_ASSIGNEE: 담당자가 프로젝트 멤버가 아닙니다';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;
