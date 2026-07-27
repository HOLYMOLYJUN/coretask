# core_task — 디자인 시스템

> **이 문서의 지위**
> 시각 규칙의 **단일 기준**이다. [04-WIREFRAME.md](04-WIREFRAME.md) 는 *배치와 위계*를 정의하고, 이 문서는 *색·타이포·아이콘·표면*을 정의한다.
> **와이어프레임의 시각 표현(이모지·색 등)과 충돌하면 이 문서가 이긴다.**
>
> | | |
> |---|---|
> | 버전 | v1.0 |
> | 최종 수정 | 2026-07-27 |
> | 범위 | v1 (M1~M4) |
> | 상태 | 🟢 확정 (D-051 ~ D-055) |

---

## 0. 여섯 가지 규칙 (2026-07-27 지정)

1. **이모지를 쓰지 않는다.** 필요하면 `lucide-react` 아이콘으로 표현한다.
2. **lucide 는 아웃라인만 쓰지 않는다.** fill 스타일을 적절히 섞는다.
3. **메인 컬러는 화이트톤 + 블루.** 색을 많이 쓰지 않는다.
4. **폰트는 Pretendard(로컬) + Montserrat(Google Fonts).** 한글 Pretendard, 영문 Montserrat, 숫자는 Pretendard 기본 · 포인트는 Montserrat.
5. **최소 14px.** 그 이하는 뱃지류만. 기본 16px, 테이블 15px, 중간 제목 18px, **h2 이하 최대 24px.**
6. **shadow 를 남용하지 않는다.** hover shadow 금지. 가능하면 **border 로 표현**한다.

아래는 이 여섯 가지를 구현 가능한 토큰으로 옮긴 것이다.

---

## 1. 색

### 1.1 토큰

```css
/* app.css — Tailwind v4 CSS-first (D-049) */
@theme {
  /* 바탕 — 순수 회색이 아니라 블루로 살짝 기울인 중성색 */
  --color-bg:            #FFFFFF;
  --color-bg-subtle:     #F7F9FC;   /* 위젯 헤더 · hover · 비활성 영역 */
  --color-bg-sunken:     #F1F5F9;   /* 보드 컬럼 바닥 */

  /* 선 — shadow 대신 이것으로 층을 만든다 (규칙 6) */
  --color-border:        #E3E8EF;
  --color-border-strong: #CBD5E1;   /* 오버레이 · 포커스 대상 */

  /* 글자 */
  --color-fg:            #0F172A;
  --color-fg-muted:      #64748B;
  --color-fg-subtle:     #94A3B8;   /* 14px 미만 뱃지에만 */

  /* 강조 — 유일한 브랜드 색 */
  --color-primary:       #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-primary-deep:  #1E40AF;   /* 리뷰중 */
  --color-primary-subtle:#EFF6FF;   /* 선택된 칩 배경 */

  /* 경고 — 유일한 알림 색 */
  --color-danger:        #DC2626;
  --color-danger-subtle: #FEF2F2;
}
```

**색은 이게 전부다.** 성공(초록)·주의(노랑) 색을 따로 두지 않는다.

> 💡 **중성색을 블루로 살짝 기울인 이유:** 순수 회색(`#F5F5F5`)은 블루 강조색과 나란히 놓이면 탁하게 보인다. 바탕이 강조색 쪽으로 아주 조금 기울면 화면이 한 벌로 읽힌다.

### 1.2 상태 색 — 뮤트 톤 원형 (D-051)

**상태 5개는 색을 그대로 유지한다. 다만 아이콘이 아니라 원형 `div`/`span` 으로 표현하고, 채도를 낮춘다.**

```css
@theme {
  --color-status-todo:     #A3B4C9;  /* 예정   슬레이트 블루 */
  --color-status-progress: #E0A758;  /* 진행중 앰버 */
  --color-status-review:   #A98CD1;  /* 리뷰중 퍼플 */
  --color-status-done:     #7CB894;  /* 완료   그린 */
  --color-status-delayed:  #D64545;  /* 지연   레드 */
}
```

```tsx
// 상태 표시는 아이콘을 쓰지 않는다
<span className="w-6 h-6 rounded-full bg-status-progress" />
```

**규칙 3(색 최소화)과 어떻게 양립하나 — 채도가 역할을 나눈다**

> **쨍한 블루 = 상호작용. 뮤트 톤 = 상태.**

| | 채도 | 의미 |
|---|---|---|
| `primary` `#2563EB` | 높음 | **누를 수 있는 것** — 버튼·링크·활성 탭·선택된 칩 |
| 상태 5색 | 낮음 | **읽는 것** — 누를 수 없는 정보 |

채도를 낮췄기 때문에 상태 원형 5개가 **서로 경쟁하지 않고 한 벌의 체계로 읽히고**, 화면에서 유일하게 튀는 색은 여전히 블루다. 색 개수는 늘었지만 **주목을 다투는 색은 하나뿐**이다.

> ⚠️ **`delayed` 만 나머지보다 채도를 높게 잡았다.** 지연은 정보가 아니라 **경고**다. 다른 넷과 같은 톤으로 눌러버리면 🔴가 신호로 기능하지 않는다(D-027이 임계값을 신중히 정한 이유와 같다).

**크기**

| 클래스 | px | 사용처 |
|---|---|---|
| `w-6 h-6` | 24 | **기본** — Task 상세, 위젯 행, 리스트 셀, 범례 |
| `w-3 h-3` | 12 | 카드 메타 줄처럼 14px 텍스트와 나란히 놓일 때 |

라벨과 함께 쓸 때는 원형 + 텍스트를 `inline-flex items-center gap-2` 로 묶는다. **원형만 단독으로 두지 않는다** — 색만으로는 색각 이상이 있는 사람이 구분할 수 없다.

---

## 2. 타이포그래피

### 2.1 폰트

**Pretendard 는 다이나믹 서브셋으로 자체 호스팅한다 (D-056).**

```css
/* index.css */
@import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
```

| | 전체본 | **다이나믹 서브셋** |
|---|---|---|
| 파일 | `PretendardVariable.woff2` 1개 | 92개 조각 (평균 31KB) |
| 첫 방문 전송량 | **2,009KB** | **보통 90~250KB** (뜬 글자의 조각만) |
| 가변 축 | 유지 | **유지** (`font-weight: 45 920`) |

브라우저가 `unicode-range` 를 보고 **화면에 실제로 나타난 글자가 속한 조각만** 내려받는다. 한글 폰트를 자체 호스팅할 때의 표준 방식이다.

> ⚠️ **서비스 워커 precache 에서 `woff2` 를 제외한다.** 92개 전부 precache 하면 첫 방문 SW 설치가 2.8MB 를 받게 되는데, 실제로 필요한 조각은 1~3개다. 파일명에 해시가 붙으므로 HTTP 캐시로 충분하다.
> D-019b 가 금지한 것은 *데이터* 캐시이고, 여기서는 **크기 때문에** 앱 셸에서 뺀 것이다.

> 💡 **대가:** `@font-face` 92개가 들어가 CSS 가 +15KB(gzip) 커진다. 2MB 를 아끼는 값으로는 싸다.

```html
<!-- index.html — Montserrat 만 CDN (규칙 4) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&display=swap">
```

```css
@theme {
  --font-sans:    'Pretendard', system-ui, sans-serif;   /* 기본 */
  --font-display: 'Montserrat', 'Pretendard', sans-serif; /* 영문 · 포인트 숫자 */
}
```

**어디에 무엇을 쓰나**

| 용도 | 폰트 |
|---|---|
| 한글 전부 | Pretendard |
| 본문 속 영문·숫자 | Pretendard (섞였을 때 자간이 튀지 않는다) |
| 로고 `core_task`, 영문 라벨(`LEAD`, `D-2`) | **Montserrat** |
| **포인트 숫자** — 대시보드 큰 수치, 진행률 `78%`, 컬럼 건수 | **Montserrat** |
| 표·리스트의 정렬되는 숫자 | Pretendard + `tabular-nums` |

> ⚠️ **본문 숫자까지 Montserrat 로 바꾸지 않는다.** 한 문장 안에서 폰트가 바뀌면 베이스라인과 자간이 흔들린다. Montserrat 는 **단독으로 서는 숫자**에만 쓴다.

> ⚠️ **PWA 와 CDN 폰트:** Google Fonts 는 외부 요청이라 첫 페인트를 잡을 수 있다. `preconnect` + `display=swap` 으로 완화하고, **Service Worker 캐시 대상에 폰트 파일을 포함**시킨다 — D-019b가 금지한 것은 *데이터* 캐시이고 폰트는 앱 셸이다.

### 2.2 타입 스케일 (규칙 5)

| px | 이름 | 용도 | 폰트 |
|---|---|---|---|
| **24** | `text-2xl` | 페이지 제목 · 대시보드 큰 수치 | Montserrat (수치) |
| **20** | `text-xl` | 화면 제목 (h2) | Pretendard |
| **18** | `text-lg` | 위젯 헤더 · 섹션 제목 · Task 상세 제목 | Pretendard |
| **16** | `text-base` | **기본 본문 · 카드 제목 · 버튼 · 입력** | Pretendard |
| **15** | `text-sm` | 표·리스트 셀 | Pretendard |
| **14** | `text-xs` | 보조 텍스트 · 메타 · 캡션 · 빈 상태 문구 | Pretendard |
| **12** | `text-badge` | **뱃지 전용** — `D-2` · 건수 · `LEAD` | Montserrat |

```css
@theme {
  --text-badge: 0.75rem;   /* 12px — 뱃지 외 사용 금지 */
  --text-xs:    0.875rem;  /* 14 */
  --text-sm:    0.9375rem; /* 15 */
  --text-base:  1rem;      /* 16 */
  --text-lg:    1.125rem;  /* 18 */
  --text-xl:    1.25rem;   /* 20 */
  --text-2xl:   1.5rem;    /* 24 — 상한 */
}
```

> 🔴 **12px 은 뱃지에서만.** 본문·라벨·버튼에 쓰지 않는다.
> 🔴 **24px 을 넘지 않는다.** 더 크게 보여야 할 것 같으면 굵기(`font-semibold`)와 여백으로 해결한다.

### 2.3 와이어프레임 대비 변경 — 카드가 커진다

[04-WIREFRAME.md](04-WIREFRAME.md) §3은 카드 텍스트를 11~12px로 그렸다. **규칙 5에 따라 전부 올린다.**

```
Task 카드
  제목        16px  Pretendard  medium
  상태        w-3 h-3 원형 + 14px 라벨        ← 아이콘 아님 (§1.2)
  경과일       14px  Pretendard  fg-muted
  마감일       14px  Pretendard   /  D-2 뱃지 12px Montserrat
  프로젝트명    14px  Pretendard  (내 업무 보드에서만)
```

> ⚠️ **대가: 카드가 높아져 한 화면에 보이는 개수가 줄어든다.**
> 그래도 이 교환은 맞다 — 이 보드는 **매일 여러 번, 오래 본다.** 12px 제목을 눈을 좁혀 읽는 비용이 스크롤 한 번보다 크다.
> 대신 카드 **여백을 줄이고**(패딩 10px) 불필요한 줄을 없애 손실을 줄인다.

---

## 3. 아이콘 (규칙 1 · 2)

### 3.1 이모지 → lucide 매핑

**기존 문서의 모든 이모지를 대체한다.** `F` = fill 스타일.

| 기존 | lucide | F | 위치 |
|---|---|---|---|
| 🏠 | `LayoutDashboard` | | 사이드바 대시보드 |
| 📋 | `ListChecks` | | 사이드바 내 업무 |
| 📁 | `Folder` | **F**(활성) | 사이드바 프로젝트 |
| ⚙️ | `Settings` | | 사이드바 설정 |
| 🔔 | `Bell` | **F**(미읽음) | 헤더 알림 |
| 🔵🟡🟣🟢🔴 상태 | **아이콘 아님** | | **§1.2 뮤트 톤 원형 `div`** |
| ⚠️ 마감없음 | `CalendarX` | | 카드·개요 |
| 🔒 잠금 | `Lock` | **F** | 완료 컬럼·개인 업무 |
| 🔺 높음 | `ChevronUp` | | 우선순위 |
| 🔻 낮음 | `ChevronDown` | | 우선순위 |
| 💬 | `MessageSquare` | | 대화 섹션 |
| ⚙ 활동로그 | `History` | | 타임라인 |
| ✓ 완료확정 | `Check` | | 버튼 |
| ↩ 반려 | `CornerUpLeft` | | 버튼 |
| 📅 | `Calendar` | | 마감일 직접 선택 |
| 👍 달성 빈상태 | `CircleCheck` | **F** | `fg-subtle` 색 |
| ↗ 외부링크 | `ExternalLink` | | 문서 목록 |
| 📱 | `Smartphone` | | 홈 화면 추가 안내 |
| ℹ️ | `Info` | | 안내 배너 |
| ▾ ▸ | `ChevronDown` `ChevronRight` | | 드롭다운·접힘 |
| ← ✕ + | `ArrowLeft` `X` `Plus` | | 공통 |

### 3.2 fill 을 쓰는 기준 (규칙 2 · 2026-07-27 개정)

> **판단 기준은 "무엇을 가리키는가"가 아니라 "아이콘의 형태가 무엇인가"다.**
> **면(body)이 있는 아이콘은 채우고, 선(linework)으로만 된 아이콘은 채우지 않는다.**

| | fill | 이유 |
|---|---|---|
| `LayoutDashboard` (사이드바·모바일 홈) | ✅ | 사각형 4개 — 채우면 형태가 또렷해진다 |
| `Folder` (프로젝트 · 최근 목록) | ✅ | 면이 넓어 12~18px 에서 아웃라인은 뭉갠다 |
| `Bell` (미읽음) | ✅ | 주의를 끌어야 한다 |
| `ListChecks` (내 업무) | ❌ | 체크마크와 선으로만 이뤄져 채우면 뭉개진다 |
| `Settings` `Plus` `X` `ArrowLeft` `Calendar` `ExternalLink` | ❌ | 선형 아이콘 · 중립 동작 |
| `Lock` — "Lead가 확정합니다" | ❌ | 잠금은 **상태 안내**이지 경고가 아니다. 채우면 필요 이상으로 무겁다 |
| `Lock` — `개인 업무` 표식 | ✅ | 목록에서 한 항목만 다르다는 표시라 또렷해야 한다 |

**fill 을 줄 때는 `strokeWidth` 를 1.5 로 낮춘다.** 기본 두께(1.75~2)를 유지하면 채운 면과 테두리가 겹쳐 덩어리로 보인다.

```tsx
<Folder size={18} strokeWidth={1.5} fill="currentColor" />
```

> ⚠️ **Task 상태는 아이콘으로 표현하지 않는다** (§1.2). fill 규칙은 상태 이외의 아이콘에만 적용된다.

> 💡 **개정 전 규칙은 "아웃라인 = 갈 곳, fill = 지금 상태" 였다.**
> 실제로 그려보니 **내비게이션 아이콘이 전부 아웃라인이면 사이드바가 흐릿하게 뜨는** 문제가 있었다. 활성 상태는 배경(`bg-bg`)과 굵기가 이미 표현하고 있어서, fill 을 활성 표시로 아껴둘 이유가 없었다.

lucide 에 fill 변형이 없는 아이콘은 `fill="currentColor"` 를 주고 `strokeWidth={1.5}` 로 낮춘다.

### 3.3 색 (2026-07-28 추가)

**아이콘은 본문색을 따라가지 않는다.**

| 상태 | 색 | 토큰 |
|---|---|---|
| 기본 | 회색 | `text-fg-muted` (#64748b) |
| hover · 활성 | 본문색 | `text-fg` (#0f172a) |
| 상태를 말하는 아이콘 | 그 상태의 색 | `text-danger` 등 — 이 규칙의 예외 |

> ⚠️ **왜 규칙이 필요했나.** §3.2 에서 fill 을 적극적으로 쓰기로 하면서 아이콘의
> **면적이 커졌다.** 여기에 `currentColor` 가 본문색(#0f172a)을 그대로 물려주니
> 사이드바가 검은 덩어리들의 열이 되었고, 정작 주인공이어야 할 본문·카드보다
> 무거워졌다 (04-WIREFRAME §1 위반). fill 규칙 자체는 옳았고 — 아웃라인만 쓰면
> 사이드바가 흐릿해진다 — 빠진 것은 **색을 낮추는 짝** 이었다.
>
> 실사용자 지적으로 발견했다 (10-UX-AUDIT §5-3).

구현은 컨테이너에서 한 번에 건다. 아이콘마다 클래스를 붙이면 빠뜨리는 곳이 생긴다:

```tsx
// app-shell/shell.tsx
const navItem = '… [&_svg]:text-fg-muted hover:[&_svg]:text-fg'
const navItemActive = 'bg-bg font-semibold [&_svg]:text-fg'
```

### 3.4 크기

| 위치 | px |
|---|---|
| 인라인 (텍스트 옆) | 14 |
| 사이드바 · 버튼 · 헤더 | 18 |
| 빈 상태 일러스트 대용 | 32 |

`strokeWidth` 는 기본 **1.75** (lucide 기본 2는 16px 이하에서 뭉친다).

---

## 4. 표면과 층 (규칙 6)

**shadow 로 층을 만들지 않는다. border 와 배경으로 만든다.**

| 층 | 표현 | 사용처 |
|---|---|---|
| 0 | 배경 `bg`, 테두리 없음 | 페이지 |
| 1 | `border 1px` + `bg` | 카드 · 위젯 · 입력 |
| 2 | `border 1px` + 헤더 `bg-subtle` | Task 상세 패널 |
| 3 | `border 1px border-strong` + **스크림** `rgba(15,23,42,.32)` | 팝오버 · 모달 · 드롭다운 |

```css
/* 오버레이도 shadow 대신 강한 테두리 + 스크림 */
.overlay { border: 1px solid var(--color-border-strong); background: var(--color-bg); }
```

> 💡 **shadow 없이 팝오버가 떠 보이게 하는 것은 스크림이다.** 뒤를 덮으면 앞이 뜬다. 그림자는 필요 없다.
> **유일한 예외:** 드래그 중인 카드는 `shadow-sm` 을 허용한다 — *"들어올렸다"* 는 물리적 사실을 전달하는 유일한 수단이다.

### hover — shadow 대신 (규칙 6)

| 대상 | hover |
|---|---|
| 카드 · 리스트 행 | 배경 → `bg-subtle` |
| 버튼(secondary) | 테두리 → `border-strong` |
| 버튼(primary) | 배경 → `primary-hover` |
| 아이콘 버튼 | 배경 → `bg-subtle` (원형) |

**`transform: translateY` 나 `scale` 을 쓰지 않는다.** 목록에서 항목이 들썩이면 클릭 대상이 흔들린다.

### 반경

```
2px  뱃지 · 칩
6px  카드 · 버튼 · 입력
8px  패널 · 모달
999px 아바타 · 카운트 뱃지
```

---

## 5. 포커스

```css
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

**모든 인터랙티브 요소에 보이는 포커스 링을 유지한다.** PRD §7의 *"드래그로만 가능한 동작이 없어야 한다"* 는 키보드로 도달 가능해야 성립한다.

---

## 6. 다크 모드 — v1 제외

**만들지 않는다.** 사내 도구이고, 두 테마를 유지하면 위 토큰이 두 벌이 된다.
토큰을 CSS 변수로 정의했으므로 **나중에 `:root[data-theme]` 블록 하나를 추가하면 붙는다.** 지금 그 값을 정하지 않을 뿐이다.

---

## 7. 적용 시 확인할 것

- [ ] `PretendardVariable.woff2` 를 `apps/web/src/assets/fonts/` 로 옮긴다 (Vite 가 해시를 붙여 캐시 무효화를 처리한다)
- [ ] shadcn 컴포넌트 설치 후 **기본 `shadow-*` 클래스를 제거**한다 (Card · Popover · Dialog · DropdownMenu)
- [ ] Tailwind v4 `@theme` 에 위 토큰을 넣고 **기본 팔레트(`red-500` 등)를 직접 쓰지 않는다**
- [ ] `text-[11px]` 같은 임의 크기 사용 금지 — 스케일 밖 값이 필요하면 이 문서를 먼저 고친다

---

## 8. 결정 로그

| # | 항목 | 결정 |
|---|---|---|
| D-051 | 상태 표현 | **뮤트 톤 원형 `div` 5색 유지.** 아이콘으로 대체하지 않는다 (§1.2) |
| D-052 | 색 위계 | **쨍한 블루 = 상호작용 / 뮤트 톤 = 상태.** 채도가 역할을 나눈다 |
| D-053 | 이모지 | **전면 금지.** lucide-react 로 대체 (§3.1 매핑표) |
| D-054 | 타이포 | Pretendard(로컬) + Montserrat(CDN). **최소 14px, 12px 은 뱃지 전용, 상한 24px** |
| D-055 | 표면 | **shadow 금지, border+스크림으로 층 표현.** 예외는 드래그 중 카드 하나 |
| D-056 | 폰트 전달 | **Pretendard 다이나믹 서브셋**(npm `pretendard`, 92조각) 자체 호스팅. `woff2` 는 SW precache 제외 |
