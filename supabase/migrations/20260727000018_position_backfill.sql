-- core_task · 18 position 자동 부여 + 기존 데이터 백필
--
-- ⚠️ 문제
--   tasks.position 기본값이 0 이라 모든 카드가 0 이었다.
--   0 과 0 사이에 끼워 넣으면 (0+0)/2 = 0 — 순서가 영원히 구분되지 않는다.
--   position 은 "사이에 끼워 넣기" 를 위한 컬럼인데 정작 생성 시 간격을 만들지 않았다.
--
-- 해결
--   1) 생성 시 컬럼(프로젝트 × 담당자) 맨 아래 = max + 1024 를 서버가 부여한다
--   2) 기존 행은 created_at 순서로 1024 간격 재부여

-- ── 1) 생성 시 position 부여 (migration 15 의 tg_task_before_insert 에 추가) ──

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
      raise exception 'FORBIDDEN: 업무 배정은 Lead 권한입니다';
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

-- ── 2) 기존 데이터 백필 ──

with ranked as (
  select id,
         row_number() over (
           partition by project_id, coalesce(assignee_id::text, '')
           order by position, created_at
         ) as rn
  from tasks
  where deleted_at is null
)
update tasks t
   set position = r.rn * 1024
  from ranked r
 where r.id = t.id;
