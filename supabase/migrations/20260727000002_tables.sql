-- core_task · 02 tables
-- 근거: docs/05-DB.md §4 (D-036 반영: comments 에 deleted_at 없음)

-- NOTE: 초대 토큰에 pgcrypto 의 gen_random_bytes 를 쓰지 않는다.
-- Supabase 는 pgcrypto 를 extensions 스키마에 두는데 마이그레이션 search_path 에 잡히지 않는다.
-- gen_random_uuid() 는 Postgres 코어 함수라 스키마 의존이 없다 (아래 invitations.token 참조).

-- ─────────────────────────────────────────────────────────────
-- 사용자 · 워크스페이스
-- ─────────────────────────────────────────────────────────────

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 40),
  email       text not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);
comment on table profiles is 'auth.users 의 공개 프로필. RLS 걸린 조인을 위해 별도 테이블로 둔다.';

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);

create table memberships (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id)   on delete cascade,
  role         workspace_role not null default 'member',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id),
  -- D-022: 1인 1워크스페이스. 이 제약이 워크스페이스 전환 개념 자체를 없앤다.
  unique (user_id)
);

-- ─────────────────────────────────────────────────────────────
-- 프로젝트
-- ─────────────────────────────────────────────────────────────

create table projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 60),
  description  text,
  customer     text,
  status       project_status not null default 'active',
  priority     task_priority  not null default 'normal',
  start_date   date,
  end_date     date,

  -- D-023: 워크스페이스당 1개 자동 생성. 보관·삭제 불가 (EC-13)
  is_personal  boolean not null default false,

  -- D-027: 정체 임계값. 프로젝트마다 조정 가능
  stale_progress_days int not null default 5 check (stale_progress_days between 1 and 60),
  stale_review_days   int not null default 2 check (stale_review_days   between 1 and 60),

  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  check (start_date is null or end_date is null or start_date <= end_date)
);

create unique index projects_one_personal
  on projects (workspace_id) where is_personal and deleted_at is null;

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       project_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
comment on column project_members.role is
  '배정·완료확정 권한의 유일한 근거 (D-016c). projects 에 lead_user_id 를 두지 않는 이유는 Lead 복수 허용 때문 (D-016e).';

-- ─────────────────────────────────────────────────────────────
-- Task — 제품의 심장
-- ─────────────────────────────────────────────────────────────

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  title        text not null check (length(trim(title)) between 1 and 200),
  description  text,

  -- NULL = 미배정. 별도 상태를 두지 않는다 (D-018)
  assignee_id  uuid references profiles(id) on delete set null,

  status       task_status   not null default 'todo',
  priority     task_priority not null default 'normal',

  start_date   date,
  due_date     date,

  -- 칸반 컬럼 내 정렬. double precision 이라 (a+b)/2 로 끼워넣을 수 있다
  position     double precision not null default 0,

  -- D-015: 정체 감지의 유일한 근거
  status_changed_at timestamptz not null default now(),
  completed_at      timestamptz,

  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  check (start_date is null or due_date is null or start_date <= due_date),
  check ((status = 'done') = (completed_at is not null))
);

-- NOTE: assignee_id NOT NULL -> due_date NOT NULL 은 CHECK 로 걸지 않는다.
-- D-021b 의 "나중에 정하기" 를 막게 되기 때문이다. 방치는 뱃지와 건수 노출로 드러낸다.

-- ─────────────────────────────────────────────────────────────
-- 대화 · 기록 · 알림
-- ─────────────────────────────────────────────────────────────

create table comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  user_id    uuid not null references profiles(id),
  body       text not null check (length(trim(body)) between 1 and 5000),
  mentions   uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- deleted_at 없음 (D-036). 하드 삭제한다.
);

create table activities (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  user_id    uuid references profiles(id),
  type       activity_type not null,
  payload    jsonb not null default '{}',
  -- D-016d: WS Admin 이 Lead 권한으로 개입한 경우 true
  via_admin  boolean not null default false,
  created_at timestamptz not null default now()
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       notification_type not null,
  task_id    uuid references tasks(id)    on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  actor_id   uuid references profiles(id),
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  -- D-037: 푸시 발송 성공 시각. NULL 이면 재시도 대상
  pushed_at  timestamptz,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 문서 링크 · 초대 · 푸시
-- ─────────────────────────────────────────────────────────────

create table documents (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title      text not null check (length(trim(title)) between 1 and 120),
  url        text not null check (url ~ '^https?://'),
  source     doc_source not null default 'other',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
comment on table documents is
  'D-012: 링크 보관함. content 컬럼 없음. 팀이 이미 Notion 을 쓰므로 문서를 옮길 이유가 없다.';

create table invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email        text not null,
  role         workspace_role not null default 'member',
  -- D-033: 초대 시 프로젝트를 함께 지정. NULL 이면 "프로젝트 미배치" 로 표시
  project_id   uuid references projects(id) on delete set null,
  -- 64 hex chars. gen_random_uuid() 는 CSPRNG 기반이고 스키마 의존이 없다
  token        text not null unique
               default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by   uuid not null references profiles(id),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index invitations_pending_email
  on invitations (workspace_id, lower(email)) where accepted_at is null;

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
comment on table push_subscriptions is
  'Web Push 구독. iOS 는 홈 화면 추가 시에만 등록된다 (Foundation §6.5).';
