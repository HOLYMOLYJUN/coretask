-- core_task · 26 FORBIDDEN 을 상황별 코드로 쪼갠다
--
-- ⚠️ 문제 (10-UX-AUDIT §7)
--   서버는 배정 거부 · 가져가기 거부 · 완료확정 거부 · 삭제 거부를 전부
--   같은 코드 `FORBIDDEN` 으로 던졌다. 클라이언트는 `:` 앞 코드로만 분기하므로
--   (06-API §6) 문구를 하나밖에 고를 수 없었고, 그 하나가 완료 확정 기준으로
--   쓰여 있었다 — 삭제를 거부당한 사람이 "리뷰중으로 올려주세요" 를 읽었다.
--
-- 원칙
--   문구는 클라이언트가 고르되, **상황을 구분하는 것은 서버의 책임**이다.
--   `:` 뒤 설명 문자열로 분기하게 두면 문구를 고칠 때마다 계약이 조용히 깨진다.
--   구분이 필요하면 코드를 늘린다.
--
-- 코드
--   FORBIDDEN_ASSIGN  남에게 배정            (tg_task_before_insert · tg_task_validate)
--   FORBIDDEN_CLAIM   미배정 아닌 것 가져가기 (tg_task_validate)
--   FORBIDDEN_DONE    완료 확정 · 되돌리기    (tg_task_validate)
--   FORBIDDEN_DELETE  삭제                   (tg_task_delete_validate)
--   FORBIDDEN_REVIEW  반려                   (reject_task)
--   FORBIDDEN_PROJECT 프로젝트 생성           (create_project)
--   FORBIDDEN         남은 것 — 클라이언트는 일반 문구로 받는다
--
-- 본문은 각 함수의 최신 정의(18 · 15 · 22 · 9 · 12)를 그대로 옮기고
-- raise 문만 바꾼다. 다른 줄을 건드리면 앞선 수정이 조용히 되돌아간다.

-- ── 생성 시 배정 (migration 18 기준) ──

create or replace function tg_task_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.status            := 'todo';
  new.completed_at      := null;
  new.status_changed_at := now();

  if new.assignee_id is not null then
    if not exists (select 1 from project_members
                   where project_id = new.project_id and user_id = new.assignee_id) then
      raise exception 'INVALID_ASSIGNEE: 담당자가 프로젝트 멤버가 아닙니다';
    end if;
    if new.assignee_id <> auth.uid() and not is_project_lead(new.project_id) then
      raise exception 'FORBIDDEN_ASSIGN: 업무 배정은 Lead 권한입니다';
    end if;
  end if;

  -- 같은 컬럼(프로젝트 × 담당자)의 맨 아래로. 간격 1024 가 이후 끼워 넣기의 여지다.
  select coalesce(max(position), 0) + 1024 into new.position
  from tasks
  where project_id = new.project_id
    and assignee_id is not distinct from new.assignee_id
    and deleted_at is null;

  return new;
end $$;

-- ── 상태 전이 · 재배정 (migration 15 기준) ──

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
      raise exception 'FORBIDDEN_DONE: 완료 확정은 Lead 권한입니다';
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
      -- US-403: 팀원은 "미배정 -> 본인" 만 가능 (가져가기).
      -- 판정은 그대로 두고 거부 사유만 셋으로 나눈다 —
      -- 목적지를 비우면 배정 해제, 남이면 배정, 본인인데 출발지가 있으면 뺏기다.
      if new.assignee_id is null then
        raise exception 'FORBIDDEN_ASSIGN: 담당자를 비우는 것은 Lead 권한입니다';
      elsif new.assignee_id <> auth.uid() then
        raise exception 'FORBIDDEN_ASSIGN: 업무 배정은 Lead 권한입니다';
      elsif old.assignee_id is not null then
        raise exception 'FORBIDDEN_CLAIM: 미배정 업무만 가져갈 수 있습니다';
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

-- ── 삭제 (migration 22 기준) ──

create or replace function tg_task_delete_validate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (
    is_project_lead(new.project_id)
    or (old.created_by = auth.uid() and old.assignee_id is null)
  ) then
    raise exception 'FORBIDDEN_DELETE: 삭제는 Lead 권한입니다 (본인이 만든 미배정 업무는 예외)';
  end if;
  return new;
end $$;

-- ── 반려 (migration 9 기준) ──

create or replace function reject_task(p_task uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;
  if not can_lead_task(p_task) then
    raise exception 'FORBIDDEN_REVIEW: 반려는 Lead 권한입니다';
  end if;

  insert into comments (task_id, user_id, body)
  values (p_task, auth.uid(), '반려 사유: ' || p_reason);

  update tasks set status = 'in_progress'
   where id = p_task and status = 'in_review';

  if not found then raise exception 'NOT_IN_REVIEW'; end if;
end $$;

-- ── 프로젝트 생성 (migration 12 기준) ──

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
  if not is_workspace_admin(v_ws) then
    raise exception 'FORBIDDEN_PROJECT: 프로젝트 생성은 워크스페이스 관리자 권한입니다';
  end if;

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
