-- core_task · 07 indexes
-- 근거: docs/05-DB.md §9
--
-- 실제로 던질 쿼리에서 역산했다. 짐작으로 붙이지 않는다.

-- 배정 보드: 프로젝트의 미완료 Task 를 담당자별로 (가장 빈번한 쿼리)
create index tasks_board on tasks (project_id, assignee_id, position)
  where deleted_at is null;

-- 내 업무 보드: 내 Task 를 상태별로 (프로젝트 횡단)
create index tasks_mine on tasks (assignee_id, status, position)
  where deleted_at is null;

-- 대시보드 · 리뷰 대기 / 지연
create index tasks_status_changed on tasks (status, status_changed_at)
  where deleted_at is null and status in ('in_progress', 'in_review');

-- 이번주 마감 / 마감 초과 배치 알림
create index tasks_due on tasks (due_date)
  where deleted_at is null and status <> 'done' and due_date is not null;

-- ⚠️ 조용한 성능 핵심.
-- is_project_member() / is_project_lead() 가 모든 쿼리의 모든 행마다 호출된다.
-- PK 가 (project_id, user_id) 라서 user_id 단독 조회는 인덱스를 못 탄다.
-- 이거 하나 빠지면 보드 로딩이 눈에 띄게 느려진다.
create index pm_by_user on project_members (user_id, role);

-- 알림 벨 미읽음 카운트
create index notif_unread on notifications (user_id, created_at desc)
  where read_at is null;

-- D-037: 푸시 재시도 대상 조회
create index notif_unpushed on notifications (created_at)
  where pushed_at is null;

create index activities_task on activities (task_id, created_at desc);
create index comments_task   on comments   (task_id, created_at);
create index documents_proj  on documents  (project_id, created_at desc);
create index projects_ws     on projects   (workspace_id, status) where deleted_at is null;
