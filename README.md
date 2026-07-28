# core_task

소규모 IT 개발팀을 위한 프로젝트·업무 관리 시스템.
PM이 매주 업무를 배정하고, 팀원이 자기 업무만 보며 일하는 흐름을 도구 하나로 끝낸다.

## 스택

| | |
|---|---|
| Frontend | Vite · React 19 · TypeScript · Tailwind v4 · TanStack Query · react-router v7 · dnd-kit |
| Backend | Supabase (Postgres · Auth · RLS · Storage · Edge Functions) |
| 배포 | Vercel (SPA) |

REST API 레이어가 없다. 권한과 불변식은 전부 DB(RLS + 트리거)가 판정하고,
클라이언트는 `supabase-js` 로 직접 읽고 쓴다. 근거는 [docs/06-API.md](docs/06-API.md) §1.

## 시작하기

```bash
npm install

# apps/web/.env.local 생성 (docs/07-SETUP.md §2-3)
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_ANON_KEY=...

npm run dev          # http://localhost:3000
```

DB 스키마는 `supabase/migrations/` 가 전부다. `npx supabase db push` 로 적용한다.
적용 후 반드시 RLS 검증을 통과시킨다:

```bash
node scripts/verify-rls.mjs   # 39개 전부 통과해야 앱 코드를 만진다
```

## 문서

설계가 코드보다 먼저다. 모든 결정은 근거와 함께 [docs/](docs/) 에 있다.

| | |
|---|---|
| [00-FOUNDATION](docs/00-FOUNDATION.md) | 단일 기준 문서 · 결정 로그 D-001~ |
| [01-PRD](docs/01-PRD.md) | 사용자 스토리 · 수용 기준 · 상태 전이표 |
| [02-IA](docs/02-IA.md) · [03-USER-FLOW](docs/03-USER-FLOW.md) · [04-WIREFRAME](docs/04-WIREFRAME.md) | 화면 · 흐름 · 레이아웃 |
| [05-DB](docs/05-DB.md) · [06-API](docs/06-API.md) | 스키마 · RLS · RPC · 에러 규약 |
| [07-SETUP](docs/07-SETUP.md) | Supabase 셋업 절차 |
| [08-FRONTEND](docs/08-FRONTEND.md) · [09-DESIGN-SYSTEM](docs/09-DESIGN-SYSTEM.md) | 프론트 규약 · 디자인 토큰 |
| [10-UX-AUDIT](docs/10-UX-AUDIT.md) | 실제 빌드를 조작해 확인한 PRD 대비 간극 · 처리 순서 |
| [11-CALENDAR](docs/11-CALENDAR.md) | 📝 기획 — 기간(시작일) · 캘린더 뷰 · 쏠림 · 프로젝트 진척 |
