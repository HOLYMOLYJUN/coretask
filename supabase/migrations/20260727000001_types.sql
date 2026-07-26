-- core_task · 01 types
-- 근거: docs/05-DB.md §3

create type task_status as enum ('todo', 'in_progress', 'in_review', 'done');
-- backlog 없음 (D-018). 미배정은 assignee_id IS NULL 로 판정한다.

create type task_priority as enum ('low', 'normal', 'high');

create type workspace_role as enum ('member', 'admin', 'owner');

create type project_role as enum ('member', 'lead');
-- viewer 없음 (D-016b). 4~20명 회사에 "보기만 하는 사람"은 실존하지 않는다.

create type project_status as enum ('active', 'archived');

create type doc_source as enum ('notion', 'figma', 'gdocs', 'other');

create type activity_type as enum (
  'created', 'assigned', 'unassigned', 'status_changed',
  'due_changed', 'completed', 'rejected', 'deleted', 'restored'
);

create type notification_type as enum (
  'task_assigned', 'task_commented', 'task_mentioned',
  'review_requested', 'task_completed', 'task_rejected',
  'tasks_unassigned', 'due_soon', 'due_passed'
);
