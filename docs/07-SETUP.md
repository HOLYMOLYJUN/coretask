# core_task — Supabase 셋업 가이드

> **이 문서의 지위**
> 설계 문서가 아니라 **실행 문서**다. [05-DB.md](05-DB.md) 의 스키마를 실제 Supabase 프로젝트에 올리기까지의 절차를 담는다.
> 한 번 하고 나면 다시 볼 일이 거의 없지만, **DB를 갈아엎고 다시 만들 때** 이 문서가 있어야 한다.
>
>
> |       |                         |
> | ----- | ----------------------- |
> | 버전    | v1.0                    |
> | 최종 수정 | 2026-07-26              |
> | 환경    | Windows 11 · PowerShell |
> | 소요 시간 | 약 40분 (Part 1~3은 15분)   |
>

---

## 시작하기 전에 — 이 문서에서 딱 3가지만 조심하면 된다


| ⚠️                                       | 왜                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------- |
| **DB 비밀번호는 생성 직후 딱 한 번만 보인다**            | 화면을 닫으면 다시 볼 수 없다. 재설정은 되지만 번거롭다. **만들자마자 비밀번호 관리자에 저장한다**        |
| **리전(Region)은 나중에 못 바꾼다**                | 바꾸려면 프로젝트를 새로 만들어 데이터를 옮겨야 한다. `Northeast Asia (Seoul)` **을 고른다** |
| `service_role` **키는 절대 브라우저에 들어가면 안 된다** | 이 키는 **RLS를 전부 무시한다.** 우리가 §5~§7에서 쌓은 권한 설계가 이 키 하나로 무력화된다        |


---



# Part 1 · Supabase 프로젝트 만들기



## 1-1. 계정 만들기

1. [https://supabase.com](https://supabase.com) 접속 → 우측 상단 **Start your project**
2. **Continue with GitHub** 를 권장한다.
  - 나중에 Vercel 배포도 GitHub 계정으로 연결하게 된다. 계정을 하나로 맞춰두면 나중에 꼬이지 않는다.
  - GitHub 계정이 없으면 이메일로 가입해도 무방하다.



## 1-2. Organization 만들기

가입 직후 Organization(조직) 생성 화면이 나온다.


| 항목       | 입력값                      | 비고                   |
| -------- | ------------------------ | -------------------- |
| **Name** | `내 회사 이름` (예: `monster`) | 나중에 변경 가능            |
| **Type** | `Company`                |                      |
| **Plan** | `Free`                   | D-041 — M3까지는 무료로 간다 |


> 💡 Organization은 **결제 단위**다. 프로젝트를 담는 폴더라고 생각하면 된다.



## 1-3. 프로젝트 생성 ⭐

**New project** 를 누르면 나오는 폼이다. **여기가 이 문서의 핵심이다.**


| 항목                    | 입력값                      | 설명              |
| --------------------- | ------------------------ | --------------- |
| **Name**              | `core-task`              | 대시보드에 표시될 이름    |
| **Database Password** | **강력한 비밀번호 생성**          | 🔴 **아래 설명 필독** |
| **Region**            | `Northeast Asia (Seoul)` | 🔴 **변경 불가**    |
| **Plan**              | `Free`                   |                 |




### Database Password — 지금 저장해라

- `Generate a password` 버튼으로 자동 생성하는 걸 권장한다.
- **생성된 비밀번호를 즉시 복사해서 비밀번호 관리자(1Password, Bitwarden, 브라우저 저장소 등)에 넣는다.**
- 이 비밀번호는 나중에 `supabase db push` **할 때마다 물어본다** (Part 4-4).
- 잃어버리면 `Settings > Database > Reset database password` 로 재설정할 수 있지만, 그때 로컬 설정을 다시 맞춰야 한다.

> 이 비밀번호는 **로그인용이 아니라 데이터베이스 직접 접속용**이다. 앱 사용자와는 무관하다.



### Region — 왜 서울인가

우리 팀도, 사용자도 전부 한국에 있다. 미국 리전을 고르면 **모든 쿼리에 왕복 200ms 이상이 추가된다.**

PRD §7에 **"보드 초기 로드 1.5초 이내"** 를 박아뒀는데, 보드 하나 그리는 데 쿼리가 3~4번 나간다. 리전 하나 잘못 고르면 그것만으로 1초를 까먹는다.

### Data API 관련 토글 3개 (D-043)

프로젝트 생성 폼 또는 생성 직후 `Settings > API` 에 아래 옵션이 있다.


| 옵션                                  | 설정        | 이유                                                             |
| ----------------------------------- | --------- | -------------------------------------------------------------- |
| **Enable Data API**                 | ✅ **ON**  | 이게 꺼지면 `supabase-js` 가 동작하지 않는다. 우리 아키텍처 전체가 여기 얹혀 있다 (API §1) |
| **Automatically expose new tables** | ❌ **OFF** | 아래 설명                                                          |
| **Enable automatic RLS**            | ✅ **ON**  | 새 테이블에 RLS가 자동으로 켜진다. 마이그레이션 밖(대시보드 수동 생성)으로 새는 경로를 막는다        |


**자동 노출을 끄는 이유 — 실패하는 방식이 다르다**


| 설정            | 내가 실수했을 때                                                          |
| ------------- | ------------------------------------------------------------------ |
| 자동 노출 **ON**  | 새 테이블에 RLS를 깜빡 → **아무도 모르게 데이터가 열린다**                              |
| 자동 노출 **OFF** | GRANT를 깜빡 → `permission denied for table tasks` → **개발 중에 바로 터진다** |


**시끄럽게 실패하는 쪽이 조용히 새는 쪽보다 낫다.** 실사용 제품이므로 더 그렇다.

> ⚠️ **이 설정을 끄면 GRANT 마이그레이션이 필요하다** — [05-DB.md](05-DB.md) §10-A (`011_grants.sql`).
> 이걸 빠뜨리면 `db push` 는 성공하는데 앱이 `permission denied` 로 실패한다. **버그가 아니라 설계대로다.**

**Create new project** 를 누르고 **2~3분 기다린다.** (프로비저닝 중에는 대시보드가 회색으로 비활성)

---



# Part 2 · 키 4개 확보하기

프로젝트가 준비되면 값 4개를 챙긴다.

## 2-1. 어디서 찾나

좌측 하단 **⚙️ Project Settings** 클릭


| 값                    | 위치                                         | 형태                             |
| -------------------- | ------------------------------------------ | ------------------------------ |
| **Project URL**      | `Settings > API`                           | `https://xxxxxxxx.supabase.co` |
| **anon public key**  | `Settings > API`                           | `eyJhbGci...` (긴 문자열)          |
| **service_role key** | `Settings > API` (`Reveal` 클릭)             | `eyJhbGci...`                  |
| **Project Ref**      | `Settings > General` 또는 URL의 `xxxxxxxx` 부분 | `xxxxxxxx` (20자 내외)            |


> 대시보드 개편으로 메뉴 이름이 조금 다를 수 있다. `API` **또는** `API Keys` 라는 이름의 항목을 찾으면 된다.



## 2-2. 두 키의 차이 — 이게 제일 중요하다


|         | `anon` (public) | `service_role` (secret)    |
| ------- | --------------- | -------------------------- |
| RLS 적용  | ✅ **적용됨**       | ❌ **전부 무시**                |
| 브라우저 노출 | **괜찮다**         | 🔴 **절대 안 된다**             |
| 우리 코드에서 | 클라이언트 전부        | Edge Function 3개만 (API §5) |


`anon` **키가 브라우저에 노출되어도 안전한 이유는, 그 키로 할 수 있는 일을 RLS가 전부 통제하기 때문이다.** 우리가 [05-DB.md](05-DB.md) §5~§7에서 정책과 트리거를 그렇게 촘촘히 짠 이유가 이것이다.

**반대로** `service_role` **키는 그 모든 통제를 우회한다.** 이 키가 프론트엔드 번들에 한 번이라도 들어가면 누구나 전 직원의 모든 업무를 읽고 쓸 수 있다.

## 2-3. 환경변수 파일 만들기

우리는 **Vite + React SPA** 다 (D-042). Vite는 `VITE_` **접두사가 붙은 변수만** 클라이언트 번들에 포함시킨다.

`apps/web/.env.local` 을 만든다.

```bash
# apps/web/.env.local — 절대 git 에 커밋하지 않는다
# VITE_ 접두사 = 브라우저에 노출됨. anon 키는 RLS 가 지키므로 안전하다.

VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...

# Web Push 공개키 (Part 5에서 생성)
VITE_VAPID_PUBLIC_KEY=
```



### 🔴 `service_role` 키는 이 파일에 넣지 않는다

**SPA에는 서버가 없다.** 그러니 `service_role` 키가 프론트엔드 저장소에 있을 이유가 아예 없다.
이 키를 쓰는 곳은 **Edge Function 3개뿐**(API §5)이고, 거기엔 Supabase가 자동으로 주입한다.

```powershell
# Edge Function 쪽 시크릿은 여기에만 등록한다
supabase secrets set VAPID_PRIVATE_KEY=xxx
```

> Edge Function 안에서는 `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` 로 이미 접근 가능하다. 따로 등록할 필요가 없다.

> 💡 **이게 Next.js 대신 SPA를 택해서 생긴 보안상 이점이다.**
> Next.js였다면 Server Action을 위해 `service_role` 키를 `.env.local` 에 두게 되고, `NEXT_PUBLIC_` 접두사를 실수로 붙이는 사고 경로가 열린다. **SPA에서는 그 키가 프론트 저장소에 존재하지 않으므로 그 사고가 불가능하다.**

`.gitignore` 에 아래가 들어있는지 **반드시 확인한다.**

```
.env*.local
.env
```

---



# Part 3 · Auth 설정

대시보드 좌측 **Authentication** 메뉴.

## 3-1. 이메일 로그인 (M1은 이것만으로 충분하다)

`Authentication > Sign In / Providers > Email`


| 설정                    | 값              | 이유       |
| --------------------- | -------------- | -------- |
| Enable Email provider | ✅ ON           |          |
| **Confirm email**     | **OFF** (개발 중) | 🔴 아래 설명 |
| Secure email change   | ON             |          |


> 🔴 `Confirm email` **을 개발 중에 끄는 이유:**
> 켜두면 계정을 만들 때마다 메일함을 확인해야 한다. **RLS 테스트에 계정 2개가 필요한데**(§6-2) 이게 매번 걸린다.
> **M4(팀 전체 투입) 전에 반드시 다시 켠다.** 아래 §6-3 체크리스트에 넣어뒀다.



## 3-2. Google 로그인 — M1에서는 건너뛴다

US-101 AC-1에 Google 로그인이 있지만, 설정하려면 **Google Cloud Console에서 OAuth 동의 화면과 클라이언트 ID를 따로 만들어야 한다.** 그것만 20~30분이다.

**M1의 완료 조건은 "드래그 배정이 끝까지 동작"이다.** 로그인 방식은 거기에 영향을 주지 않는다.
→ **M3~M4에서 팀원을 초대할 때 붙인다.** 그때는 팀원들이 회사 Google 계정을 쓸 테니 효용도 그때 생긴다.

## 3-3. URL 설정

`Authentication > URL Configuration`


| 항목                | 값                              |
| ----------------- | ------------------------------ |
| **Site URL**      | `http://localhost:3000` (개발 중) |
| **Redirect URLs** | `http://localhost:3000/`**     |


배포 후에는 Vercel 도메인을 **추가**한다 (교체가 아니라 추가 — 로컬 개발도 계속 해야 한다).

```
https://core-task.vercel.app/**
```

---



# Part 4 · 로컬 연결과 스키마 적용

여기서부터는 PowerShell을 쓴다.

## 4-1. 프로젝트 폴더 준비

```powershell
cd c:\Users\vlck1\Desktop\core_task
```

아직 프론트엔드 프로젝트가 없어도 된다. **스키마를 먼저 올리고 앱을 나중에 붙여도 무방하다.**

## 4-2. Supabase CLI 설치

**방법 A — Scoop (권장)**

```powershell
# Scoop 이 없다면 먼저 설치
irm get.scoop.sh | iex

scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

supabase --version
```

**방법 B — npm (Node 프로젝트가 이미 있다면)**

```powershell
npm install supabase --save-dev
npx supabase --version
```

> 방법 B를 쓰면 이후 모든 명령 앞에 `npx` 를 붙인다.
> CLI 버전이 프로젝트에 고정되는 장점이 있다 — 나중에 팀원이 합류해도 같은 버전을 쓴다.



## 4-3. 로그인과 연결

```powershell
# 브라우저가 열리고 인증된다
supabase login

# 로컬 폴더에 supabase/ 디렉터리 생성
supabase init

# 원격 프로젝트와 연결 (Part 2-1 에서 확인한 Project Ref)
supabase link --project-ref xxxxxxxx
```

`supabase link` 실행 시 **DB 비밀번호를 묻는다.** Part 1-3에서 저장해둔 값을 넣는다.

## 4-4. 마이그레이션 파일 만들기

[05-DB.md](05-DB.md) §12의 순서대로 파일을 만든다.

```powershell
supabase migration new types
supabase migration new tables
supabase migration new authz
supabase migration new rls
supabase migration new triggers
supabase migration new views
supabase migration new indexes
supabase migration new storage
supabase migration new rpc
supabase migration new cron
supabase migration new grants
```

`supabase/migrations/` 에 타임스탬프가 붙은 빈 `.sql` 파일 10개가 생긴다.
**각 파일에 [05-DB.md](05-DB.md) 와 [06-API.md](06-API.md) 의 해당 섹션 SQL을 붙여넣는다.**


| 파일                 | 내용 출처                                 |
| ------------------ | ------------------------------------- |
| `..._types.sql`    | DB §3                                 |
| `..._tables.sql`   | DB §4 (+ §11 D-036의 `comments` 수정 반영) |
| `..._authz.sql`    | DB §5                                 |
| `..._rls.sql`      | DB §6 (+ §11 D-036 정책)                |
| `..._triggers.sql` | DB §7                                 |
| `..._views.sql`    | DB §8 + API §9 `v_my_lead_projects`   |
| `..._indexes.sql`  | DB §9                                 |
| `..._storage.sql`  | DB §11-A                              |
| `..._rpc.sql`      | API §4 (6개 함수)                        |
| `..._cron.sql`     | DB §11-B + API §5.3 · §5.2 재시도        |
| `..._grants.sql`   | **DB §10-A** ← 자동 노출을 껐으므로 필수         |


> 🔴 **순서가 중요하다.** `authz` 가 `rls` 보다 먼저여야 한다 — 정책이 그 함수들을 참조하기 때문이다. `supabase migration new` 는 실행 순서대로 타임스탬프를 붙이므로 **위 순서 그대로 명령을 실행하면 자동으로 맞는다.**



## 4-5. 확장 기능 켜기

`cron` 마이그레이션 **맨 위**에 넣는다.

```sql
create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;
```

또는 대시보드 `Database > Extensions` 에서 `pg_cron`, `pg_net` 을 검색해 활성화해도 된다.

## 4-6. 적용

```powershell
# 무엇이 적용될지 먼저 확인
supabase db diff --linked

# 실제 적용
supabase db push
```

**에러가 나면 그 파일만 고쳐서 다시** `db push` **한다.** 이미 성공한 마이그레이션은 건너뛴다.

## 4-7. 타입 생성

```powershell
supabase gen types typescript --linked > packages/types/src/database.ts
```

> **스키마를 바꿀 때마다 이 명령을 다시 돌린다.** 손으로 타입을 쓰지 않는다 — DB가 유일한 진실이므로 타입도 거기서 나와야 한다 (API §8).

---



# Part 5 · 웹 푸시 키 (M2에서 필요)

M1에는 필요 없다. 알림을 붙이는 M2 시점에 한다.

```powershell
npx web-push generate-vapid-keys
```

**공개키와 비공개키가 가는 곳이 다르다.**

```bash
# apps/web/.env.local  — 공개키만
VITE_VAPID_PUBLIC_KEY=BE...
```

```powershell
# Edge Function  — 양쪽 다 필요 (발송 시 서명에 쓴다)
supabase secrets set VAPID_PUBLIC_KEY=BE... VAPID_PRIVATE_KEY=xxx
```

> 공개키는 브라우저가 구독을 만들 때 쓰므로 노출되어도 된다. **비공개키는 절대** `VITE_` **를 붙이지 않는다.**

---



# Part 6 · 검증 — 여기가 진짜 중요하다



## 6-1. 스키마가 올라갔는지

대시보드 `Table Editor` 에서 테이블 12개가 보이면 성공이다.

```
profiles / workspaces / memberships / projects / project_members
tasks / comments / activities / notifications / documents
invitations / push_subscriptions
```

`Database > Policies` 에서 **모든 테이블에 🔒 RLS enabled** 표시가 있는지 확인한다.

## 6-2. RLS 검증 — 코드 짜기 전에 이걸 먼저 한다 🔴

**검증 스크립트가 저장소에 있다.** 계정 2개를 실제로 만들어 **PostgREST + anon 키 + RLS 라는 진짜 경로**로 39가지를 확인한다.

```powershell
node scripts/verify-rls.mjs
```

> 💡 **SQL Editor 에서 슈퍼유저로 확인하지 않는 이유:** 실제 사용자는 슈퍼유저가 아니다. 검증도 사용자와 같은 경로로 해야 의미가 있다. 슈퍼유저 SQL 은 RLS 를 우회하므로 "통과"가 거짓일 수 있다.

**확인하는 것 (39개)**

| 그룹 | 내용 |
|---|---|
| 1 | 가입 + `profiles` 자동 생성 (D-044) |
| 2 | `create_workspace` · `개인 업무` 자동 생성 · Owner 부여 · 1인 1워크스페이스 |
| 3 | `create_project` RPC · 생성자 자동 Lead · Task 기본값 |
| **4** | 🔴 **워크스페이스 격리** — 남의 프로젝트/Task 가 목록에도, 직접 ID 조회에도 안 나옴 |
| 5 | 상태 전이 — `todo→in_review` 금지, **팀원은 `done` 불가**, Lead 만 완료 확정 |
| 6 | 배정 — 가져가기 마감일 필수, 이미 배정된 것 못 가져감, 남의 업무 못 뺏음 |
| 7 | 마지막 Lead 제거·강등 차단 |
| 8 | 활동 로그 자동 기록 + **클라이언트 위조 불가** · 알림 자동 생성 |
| 9 | 뷰에도 RLS 적용 (`security_invoker`) · 진행률 계산 |

**`통과 39 · 실패 0` 이 나와야 앱 코드를 시작한다.**
실패가 하나라도 있으면 **거기서 멈추고 고친다** — 나중에 확인하면 이미 실사용 데이터가 들어가 있다.

스크립트는 실행할 때마다 타임스탬프가 붙은 계정 2개를 새로 만든다. 끝나면 안내대로 `Authentication > Users` 에서 지운다.

<details>
<summary>SQL Editor 로 직접 확인하고 싶다면</summary>

[06-API.md](06-API.md) §10에 *"RLS 검증 테스트부터 쓴다"* 고 적어둔 이유가 있다.
**나중에 확인하면 이미 실사용 데이터가 들어가 있다.**

`Authentication > Users` 에서 **Add user** 로 계정 2개를 만든다.

```
alice@test.com  / test1234
bob@test.com    / test1234
```

`SQL Editor` 에서 아래를 순서대로 실행한다.

```sql
-- 1. Alice 로 워크스페이스와 프로젝트를 만든다
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='alice@test.com'))::text, true);

select create_workspace('테스트 회사');

insert into projects (workspace_id, name, created_by)
values ((select workspace_id from memberships
         where user_id = (select id from auth.users where email='alice@test.com')),
        'Alice 프로젝트',
        (select id from auth.users where email='alice@test.com'));

-- 2. Bob 으로 전환 — Alice 의 프로젝트가 보이면 안 된다
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='bob@test.com'))::text, true);

select count(*) from projects;   -- ✅ 기대값: 0
```

`0` **이 나와야 한다.** `1` 이 나오면 RLS가 새고 있는 것이므로, **여기서 멈추고 정책을 고친다.**

### 이어서 확인할 3가지


| 확인                           | 기대 결과                   |
| ---------------------------- | ----------------------- |
| 팀원이 `in_review → done` 시도    | `FORBIDDEN` 예외          |
| `todo → done` 직행 시도 (담당자 있음) | `INVALID_TRANSITION` 예외 |
| 마지막 Lead 제거 시도               | `LAST_LEAD` 예외          |


```sql
-- 예: 리뷰 건너뛰기가 막히는지
update tasks set status='done' where id='<task_id>';
-- ✅ 기대: ERROR: INVALID_TRANSITION: todo -> done. in_review 를 거쳐야 합니다
```

</details>

## 6-3. M4(팀 전체 투입) 전 최종 체크리스트

개발 중 편의를 위해 느슨하게 둔 것들을 **되돌리는 목록**이다.

- [ ] `Authentication > Email > Confirm email` **다시 ON** (§3-1에서 껐다)
- [ ] `Site URL` / `Redirect URLs` 에 **실제 배포 도메인 추가**
- [ ] 테스트 계정 `alice@test.com` / `bob@test.com` **삭제**
- [ ] **Supabase Pro 전환** (D-041 — 일일 백업)
- [ ] `Settings > Database > Backups` 에서 **백업이 실제로 도는지 눈으로 확인**
- [ ] Google OAuth 연결 (§3-2에서 미룬 것)
- [ ] iOS 팀원 전원 **"홈 화면에 추가" + 알림 권한 허용** (Foundation §6.5)

> 🔴 **백업 항목은 "설정했다"가 아니라 "돌고 있는 걸 봤다"까지 가야 한다.**
> Foundation §12: *"실사용 데이터가 들어간 순간부터 유실은 되돌릴 수 없다."*

---



# 자주 막히는 곳


| 증상                                                    | 원인 · 해결                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `supabase: command not found`                         | Scoop 설치 후 **PowerShell을 새로 연다.** PATH가 갱신되지 않았다                      |
| `irm get.scoop.sh` 가 실패                               | 실행 정책 문제. `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` 후 재시도 |
| `supabase link` 에서 비밀번호 거부                            | 특수문자가 PowerShell에서 잘렸을 수 있다. **비밀번호를 작은따옴표로 감싸거나** 대시보드에서 재설정         |
| `db push` 시 `function is_project_lead does not exist` | **마이그레이션 순서가 어긋났다.** `authz` 가 `rls` 보다 앞이어야 한다                       |
| 정책 만들 때 `infinite recursion detected`                 | `security definer` **를 빠뜨렸다.** DB §5의 함수들에 전부 붙어 있어야 한다               |
| `cron.schedule` 이 없다는 에러                              | `pg_cron` 확장이 꺼져 있다 (§4-5)                                            |
| 쿼리가 0건만 반환                                            | RLS가 막고 있는 것이다. **정상 동작일 수 있다** — 로그인 상태와 프로젝트 소속을 먼저 확인한다            |
| `permission denied for table tasks`                   | `grants` **마이그레이션이 빠졌다** (DB §10-A). 자동 노출을 껐기 때문이며 정상적인 실패다          |
| `permission denied for function move_task`            | 같은 원인. `grant execute` 목록에 그 함수가 있는지 확인한다                             |
| 뷰 조회 시 남의 데이터가 보임                                     | `alter view ... set (security_invoker = true)` 를 빠뜨렸다 (DB §8)         |


---



# 다음 단계

```
[완료] 설계 문서 7개 (00 ~ 06)
[완료] Supabase 셋업   docs/07-SETUP.md   ← 이 문서
   ↓
[다음] M1 개발
        · Vite + React 모노레포 구성 (D-042)
        · 로그인 → 워크스페이스 → 프로젝트 → Task
        · 배정 보드 + 드래그 + 마감일 팝오버 + 가져가기
```

**M1 완료 조건** (Foundation §12)

> 로그인 → 프로젝트 생성 → Task 생성 → **배정 보드에서 드래그 배정 + 마감일 지정 + 가져가기가 끝까지 동작**

