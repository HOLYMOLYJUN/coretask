# core_task — 프론트엔드 스택 · 아키텍처

> **이 문서의 지위**
> [00-FOUNDATION.md](00-FOUNDATION.md) §9 (D-042) 를 상세화한 문서다.
> *"무엇을 쓰고, 무엇을 쓰지 않으며, 상태가 어디에 사는가"* 를 정의한다.
>
> | | |
> |---|---|
> | 버전 | v1.0 |
> | 최종 수정 | 2026-07-27 |
> | 범위 | v1 (M1~M4) |
> | 상태 | 🟡 검토 대기 (§7 결정 필요 2건) |

---

## 1. 선택 기준

Foundation §9의 제약이 그대로 판단 기준이다.

> *"개발 시간은 회사 업무 외 시간뿐이다 → 기능 하나의 기회비용이 매우 크다."*

그래서 라이브러리 하나를 넣을 때 이 질문을 통과해야 한다.

1. **이게 없으면 내가 직접 짜야 하는가?** 직접 짜도 30줄이면 넣지 않는다.
2. **우리가 이미 내린 결정과 맞물리는가?** (D-031 패널, D-035 재조회, D-019 PWA …)
3. **배우는 데 드는 시간 < 아끼는 시간인가?**

---

## 2. 채택 스택

| 영역 | 선택 | 근거 |
|---|---|---|
| 빌드 | **Vite 6** | D-042 |
| 언어 | **TypeScript** (strict) | DB에서 타입을 생성하므로 타입이 실제로 값을 한다 |
| UI | **React 19** | |
| 라우팅 | **react-router v7** (declarative) | **D-031** — `backgroundLocation` 이 "어디서 왔는가" 그 자체다 (IA §5) |
| 서버 상태 | **TanStack Query v5** | **D-035** — `refetchOnWindowFocus` 가 Realtime 미사용의 대체 수단. 낙관적 업데이트는 `onMutate`/`onError` |
| 스타일 | **Tailwind CSS v4** | 원문 결정 유지 |
| 컴포넌트 | **shadcn/ui** | 원문 결정 유지. 복사해 쓰는 방식이라 의존성이 늘지 않는다 |
| 드래그 | **dnd-kit** | 배정 보드의 핵심. **키보드 센서 내장** — PRD §7 *"드래그로만 가능한 동작이 없어야 한다"* 를 만족시킨다 |
| PWA | **vite-plugin-pwa** | **D-019 / D-019b** — 앱 셸만 캐시하는 정밀 제어가 가능 |
| 백엔드 | **@supabase/supabase-js** | |
| 날짜 | **date-fns** (+ `ko` 로케일) | 경과일·`D-2`·"이번주 금" 계산. tree-shakeable |
| 토스트 | **sonner** | 에러 문구(API §6) + **10초 Undo**(US-302 AC-4). 액션 버튼과 duration 내장 |
| 아이콘 | **lucide-react** | shadcn 기본 |
| 테스트 | **Vitest** | 순수 로직만 (§6) |

```powershell
npm create vite@latest apps/web -- --template react-ts

npm i @supabase/supabase-js @tanstack/react-query react-router \
      @dnd-kit/core @dnd-kit/sortable date-fns sonner lucide-react
npm i -D vite-plugin-pwa tailwindcss @tailwindcss/vite \
      @tanstack/react-query-devtools vitest
```

---

## 3. 채택하지 **않은** 것과 그 이유

나중에 "왜 안 썼지?" 하고 다시 넣지 않기 위해 기록한다.

### 3.1 Zustand · Redux · Jotai — 전역 상태 라이브러리 ❌

**이 앱의 상태를 전부 세어보면 전역 스토어가 가져갈 몫이 없다.**

| 상태 | 소유자 |
|---|---|
| Task · 프로젝트 · 멤버 · 댓글 · 알림 | **TanStack Query** |
| 현재 프로젝트 · 열린 Task · 필터 칩 · 뷰 전환 · 탭 | **URL** (IA §3.4 — 새로고침·공유에서 유지돼야 한다) |
| 세션 | `supabase.auth.onAuthStateChange` + Context |
| 드래그 중 | dnd-kit 내부 |
| 팝오버 · 인라인 입력 | 로컬 `useState` |
| 토스트 큐 | sonner |

> **전역 스토어를 쓰는 가장 흔한 이유가 "필터 상태 공유"인데, 우리는 그걸 URL로 보냈다** (IA §3.4).

**그리고 더 중요한 이유가 있다.** 전역 스토어를 만들면 거의 반드시 **서버 데이터를 스토어에 복사**하게 되고, 그 순간 같은 사실이 두 군데에 산다. 이건 우리가 설계 내내 죽인 문제다:

- **D-005** — 보드는 둘, `status` 필드는 하나
- **D-018** — `backlog` 폐기. 미배정은 `assigneeId IS NULL` 하나로만

**DB에서 두 벌의 진실을 막아놓고 프론트에서 다시 만들 이유가 없다.**

> **도입 신호:** ① 다중 선택 후 일괄 처리(카드 5개를 골라 한 번에 배정) ② URL에 담기엔 복잡한 필터 빌더 ③ 오프라인 큐(D-019에서 L3 제외했으므로 해당 없음).
> **셋 다 v1 스코프 밖이다.**

### 3.2 react-hook-form · zod ❌ (v1 한정)

v1의 폼은 대부분 **입력 1개**다 — 프로젝트 생성(이름), Task 생성(제목), 초대(이메일). 가장 큰 폼인 프로젝트 설정도 필드 8개에 실시간 검증이 필요 없다.

그리고 **검증의 진짜 주인은 DB다.** 길이·형식·상태 전이·권한이 전부 CHECK 제약과 트리거에 있다(DB §4, §7). 프론트에 두 번째 검증 계층을 만들면 또 두 벌이 된다.

> **도입 신호:** 필드 10개 이상 + 필드 간 의존 검증이 있는 폼이 생기면. 그때는 zod 스키마를 **DB 제약에서 유도**해서 두 벌이 되지 않게 한다.

### 3.3 TanStack Router ❌

타입 안전한 search params는 우리 URL 사용량(IA §3.4)에 잘 맞았을 것이다. 다만 **D-031(패널/전체 페이지)의 `backgroundLocation` 패턴이 react-router 쪽에 훨씬 잘 정리돼 있고**, 학습 비용이 이 프로젝트의 시간 제약과 안 맞는다.

→ search params 타입 안전성은 **작은 파서 훅 하나**로 대체한다 (§5.3).

### 3.4 axios · ky ❌
`supabase-js` 가 유일한 네트워크 경로다(API §1). HTTP 클라이언트를 따로 둘 이유가 없다.

### 3.5 Storybook ❌ (v1 한정)
컴포넌트 12개(Wireframe §9)에 사용자가 20명이다. 유지 비용이 이득을 넘는다.

### 3.6 react-beautiful-dnd ❌
유지보수가 멈췄고 React 19 호환이 불확실하다. **dnd-kit 은 키보드 센서를 내장**해 PRD §7의 접근성 요구를 그냥 만족시킨다.

### 3.7 framer-motion (motion) ❌ (v1 한정)

**이미 채택한 것들이 필요한 모션의 대부분을 갖고 있다.**

| 움직이는 것 | 이미 처리하는 것 |
|---|---|
| Task 상세 패널 슬라이드 | shadcn `Sheet` (Radix + `tw-animate-css`) |
| 마감일 팝오버 | shadcn `Popover` |
| 확인 모달 (멤버 제거 · 반려) | shadcn `AlertDialog` |
| 알림 드롭다운 | shadcn `DropdownMenu` |
| 카드 드롭 안착 | **dnd-kit** (자체 transform·transition) |
| 토스트 등장·퇴장 | sonner |

**남는 것은 FLIP 레이아웃 전환 하나뿐이다** — 필터 칩으로 카드가 사라질 때 남은 카드가 부드럽게 올라오는 것. CSS로는 불가능하고 framer-motion의 `layout` 이 한 줄로 해결한다.

**그 하나에 ~40KB.** 번들 목표 200KB의 20%다. 그리고 필터 전환은 **즉시 바뀌는 편이 오히려 명확하다.**

> ⚠️ **드래그 영역에서는 오히려 해롭다.** dnd-kit 이 `transform` 을 소유하는데 framer-motion 이 같은 속성을 건드리면 드래그가 튄다.

> ⚠️ **매일 수십 번 여는 도구다.** 첫 방문에 기분 좋은 모션이 **50번째 방문에는 지연으로 느껴진다.** 대시보드 위젯이 매번 페이드인하는 것이 정확히 그 경우다.

> **도입 신호:** ① 보드에 FLIP 레이아웃 전환이 실제로 필요하다고 판단될 때 ② 온보딩에 순차 연출이 필요할 때. 그때도 **드래그 영역 밖에서만** 쓴다.

---

## 3-A. 모션 스펙 — 라이브러리 없이 지킬 규칙

> **원칙: 이동은 애니메이션하고, 등장은 즉시 한다.**
> 모션은 **공간 관계를 설명할 때만** 쓴다 — *"패널은 오른쪽에서 왔다"*, *"카드가 원래 자리로 돌아갔다"*.
> 장식으로 쓰지 않는다.

| 대상 | 지속 | 이징 | 비고 |
|---|---|---|---|
| Task 상세 패널 열림 | 200ms | `ease-out` | 오른쪽에서 슬라이드. **보드가 뒤에 남아 있음을 알리는 정보다** (D-031) |
| 패널 닫힘 | 150ms | `ease-in` | 닫기는 더 빠르게 — 이미 본 화면이다 |
| 팝오버 · 드롭다운 | 120ms | `ease-out` | 마감일 팝오버 포함 |
| 카드 드롭 안착 | dnd-kit 기본 (~250ms) | — | 건드리지 않는다 |
| **낙관적 롤백** | 200ms | `ease-out` | 🔴 **필수.** 아래 참조 |
| 토스트 | sonner 기본 | — | |
| 대시보드 위젯 · 보드 초기 렌더 | **0ms** | — | **애니메이션하지 않는다** |
| 페이지 전환 | **0ms** | — | 1.5초 예산을 갉아먹는다 |

### 낙관적 롤백만은 모션이 필수다

API §7: *"카드만 슬쩍 돌아가면 사용자는 자기 손이 미끄러졌다고 생각하고, 같은 시도를 반복한다."*

**카드가 "되돌아갔다"는 사실이 읽혀야 한다.** 즉시 점프하면 그냥 드래그가 실패한 것처럼 보인다.
`transform` transition 200ms + 토스트 문구(§5.2)가 함께 나가야 완결된다.

### `prefers-reduced-motion` 은 예외 없이 존중한다

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```
전정 장애가 있는 사람에게 슬라이드는 불편이 아니라 증상이다. **롤백도 예외가 아니다** — 그 경우엔 토스트 문구가 유일한 신호가 되므로 문구가 더 중요해진다.

---

## 4. 폴더 구조

```
apps/web/
  src/
    main.tsx                  QueryClient · Router · Toaster 조립
    routes.tsx                react-router — backgroundLocation 패턴 (IA §5)

    lib/
      supabase.ts             클라이언트 1개 (서버가 없으므로 두 벌 불필요, D-042)
      errors.ts               DB 에러코드 → 사용자 문구 (API §6)
      query.ts                QueryClient 설정 · queryKey 팩토리
      date.ts                 경과일 · D-n · 마감일 퀵칩 (D-034)

    features/
      auth/                   로그인 · 가입 · 초대 수락 · 세션 Context
      onboarding/             워크스페이스 생성 · 첫 진입 안내
      board/                  ⭐ 배정 보드 · 드래그 · 마감일 팝오버
      my-tasks/               내 업무 보드 · 리스트 뷰 · 모바일 리스트
      task/                   상세 패널/페이지 · 타임라인 · 댓글
      dashboard/              위젯
      projects/               목록 · 개요 · 설정 · 멤버
      notifications/          벨 드롭다운 · 알림 목록
      settings/               프로필 · 멤버 · 알림 권한

    components/               packages/ui 로 승격 전 대기소
    app-shell/                사이드바 · 헤더 · 모바일 하단탭 (Wireframe §2)

  vite.config.ts              vite-plugin-pwa (D-019b 캐시 전략)
  index.html

packages/
  types/src/database.ts       supabase gen types (자동 생성, 손대지 않는다)
  ui/                         컴포넌트 12개 (Wireframe §9)
```

**기능 단위(feature)로 자르고 기술 단위(components/hooks/utils)로 자르지 않는다.**
배정 보드를 고칠 때 열어야 할 파일이 한 폴더에 있어야 한다.

---

## 5. 규약

### 5.1 데이터 — TanStack Query

```ts
// lib/query.ts
export const qk = {
  board:     (projectId: string) => ['board', projectId] as const,
  myTasks:   (userId: string)    => ['my-tasks', userId] as const,
  task:      (taskId: string)    => ['task', taskId] as const,
  project:   (id: string)        => ['project', id] as const,
  notifs:    ()                  => ['notifications'] as const,
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,   // ← D-035 (Realtime 미사용의 대체)
      staleTime: 30_000,
      retry: 1,
    },
  },
})
```

**규칙**
- `queryKey` 는 **`qk` 팩토리로만** 만든다. 문자열을 손으로 쓰면 invalidate가 어긋난다.
- 🔴 **키 하나에는 모양 하나. 같은 키에 서로 다른 `queryFn` 을 붙이지 않는다.**
- **서버 데이터를 `useState` 로 복사하지 않는다.** 복사하는 순간 §3.1의 문제가 시작된다.
- 낙관적 업데이트는 `onMutate` → `onError` 롤백 → `onSettled` invalidate **3단 고정** (API §7).

> ⚠️ **두 번째 규칙은 실제로 밟은 지뢰다 (2026-07-27).**
> 사이드바·대시보드·프로젝트 목록이 각각 `['projects']` 에 다른 `queryFn` 을 붙이고 있었다.
> **TanStack Query 는 키 하나당 캐시가 하나라 나중에 refetch 한 쪽이 앞의 데이터를 덮어쓴다.**
> 사이드바 모양(`{id, name}`)이 덮어쓰자 `project_id` 가 `undefined` 가 되어 링크가
> `/projects/undefined/board` 로 나갔고, **존재하지 않는 프로젝트라 빈 보드가 떴다.**
>
> 증상이 "가끔 UUID가 보인다 / 가끔 빈 보드로 간다" 라 원인과 멀어 보였다 — refetch 타이밍에 좌우되기 때문이다.
>
> **`qk` 팩토리를 쓰는 것만으로는 이걸 막지 못한다.** 키가 같으면 팩토리를 통했든 아니든 충돌한다.
> → **목록성 데이터는 조회 훅을 하나 만들어 공유한다** (`features/projects/use-projects.ts`).

### 5.2 에러 — 코드로 분기, 문구는 한 곳

```ts
// lib/errors.ts
export const MESSAGE: Record<string, string> = {
  INVALID_TRANSITION: '완료 확정은 리뷰를 거쳐야 합니다. 먼저 리뷰중으로 올려주세요',
  FORBIDDEN:          '완료 확정은 Lead가 합니다. 리뷰중으로 올려주세요',
  INVALID_ASSIGNEE:   '이 사람은 프로젝트 멤버가 아니에요. 먼저 프로젝트에 추가해주세요',
  LAST_LEAD:          '프로젝트에는 최소 1명의 Lead가 필요합니다',
  // … API §6 전체
}
```

- **문구를 컴포넌트에 흩지 않는다.** 같은 에러가 보드·상세·리스트 세 곳에서 난다.
- **DB 코드를 사용자에게 노출하지 않는다.**
- `PGRST116`(0건) 은 **404로 다룬다** — 권한 없음을 알리면 리소스 존재가 유출된다 (D-032).

### 5.3 URL — 필터·뷰 상태의 유일한 집

```ts
// 타입 안전한 search params (TanStack Router 대신 쓰는 대체물)
export function useBoardFilter() {
  const [sp, setSp] = useSearchParams()
  const filter = (['all','in_progress','review','delayed'] as const)
    .find((v) => v === sp.get('filter')) ?? 'all'
  return [filter, (v: typeof filter) => setSp({ filter: v }, { replace: true })] as const
}
```

**URL에 들어가는 것:** 현재 프로젝트 · 열린 Task · 보드 필터 칩 · `view=board|list` · `tab=mine|all` · 리스트 필터
**URL에 안 들어가는 것:** 팝오버 열림 · 드래그 중 · 인라인 입력

### 5.4 권한 — UI는 숨기고, 판정은 DB가

```ts
// ❌ 이렇게 하지 않는다 — 권한 규칙이 두 벌이 된다
if (user.role === 'lead') { /* … */ }

// ✅ 서버가 준 값을 그대로 쓴다
const { data: leadProjects } = useQuery(...)   // v_my_lead_projects (D-038)
const canAssign = leadProjects.some((p) => p.id === projectId)
```

- **권한 없는 액션은 렌더하지 않는다.** 비활성 버튼도 두지 않는다 (PRD §4).
- 그럼에도 요청이 가면 **DB가 막고**, 우리는 §5.2의 문구를 보여준다.

### 5.5 접근성

PRD §7: *"드래그로만 가능한 동작이 없어야 한다."*

| 동작 | 마우스 | 대안 |
|---|---|---|
| 배정 | 드래그 | 카드 메뉴 → 담당자 선택 (dnd-kit `KeyboardSensor` 포함) |
| 상태 변경 | 드래그 | 상세 패널 드롭다운 / **모바일은 액션 버튼**(US-505) |
| 완료 확정 | — | 버튼 (원래 드래그가 아니다) |

---

## 6. 테스트 — 무엇을 테스트할 가치가 있나

**가장 중요한 테스트는 이미 있다: [`scripts/verify-rls.mjs`](../scripts/verify-rls.mjs) (39개).**
권한과 상태 전이는 DB가 판정하므로, 그걸 실제 경로로 검증하는 게 UI 테스트보다 값어치가 크다.

프론트에서는 **순수 로직만** Vitest로 덮는다.

| 대상 | 왜 |
|---|---|
| `position` 계산 (`(a+b)/2`) | 틀리면 카드 순서가 조용히 깨진다 |
| 경과일 · `D-n` · 지연 판정 | 경계(오늘/자정)에서 틀리기 쉽다 |
| 마감일 퀵칩 ("이번주 금") | 요일 계산은 늘 오프바이원이 난다 |
| 에러코드 파서 | 문구 매핑이 어긋나면 전부 "알 수 없는 오류" |

**컴포넌트 렌더 테스트는 v1에서 쓰지 않는다.** 화면이 아직 자주 바뀐다.
**E2E(Playwright)는 M3에 도입한다** — 도그푸딩으로 실사용이 시작되는 시점이다.

---

## 7. 결정 완료 (2026-07-27)

| # | 질문 | 결정 |
|---|---|---|
| 1 | Tailwind 버전 | **v4** (D-049). `@tailwindcss/vite` 공식 플러그인 + CSS-first 설정. `tailwind.config.js` 없음 |
| 2 | `packages/ui` 분리 시점 | **당장 분리하지 않는다** (D-050). `apps/web/src/components` 에서 시작 |

**D-050 승격 기준**
Wireframe §9의 12개를 처음부터 패키지로 빼지 않는다. 쓰는 앱이 하나인데 패키지를 나누면 import 경로와 빌드 단계만 늘어난다.
→ **실제로 두 곳 이상에서 쓰이는 것이 확인되면** `packages/ui` 로 옮긴다. `TaskCard` · `StatusBadge` · `DueBadge` 는 보드·리스트·위젯 세 곳에서 쓰이므로 가장 먼저 승격될 후보다.

---

## 8. 다음 단계

```
[완료] 설계 08개 문서 · DB 13개 마이그레이션 · RLS 검증 39/39
   ↓
[다음] M1 스캐폴딩
        · Vite 프로젝트 생성 + Tailwind + shadcn
        · lib/supabase · lib/query · lib/errors
        · 로그인 → 워크스페이스 생성 → 프로젝트 → 배정 보드
   ↓
       M1 완료 조건 (Foundation §12)
       드래그 배정 + 마감일 지정 + 가져가기가 끝까지 동작
```
