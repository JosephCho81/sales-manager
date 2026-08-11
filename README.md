# 판매관리 시스템

한국에이원·금화·라성 공동 판매 관리를 위한 내부 웹 애플리케이션입니다.

## 주요 기능

| 메뉴 | 내용 |
|---|---|
| 대시보드 | 미수금 현황 및 월별 미결 계산서 요약 |
| 입고 입력 | 물량 입력 → 마진 자동 계산 (1/3 배분) |
| 낙찰 단가 관리 | 품목별 입찰 기간·납품단가·원가단가 관리 |
| 계산서 발행 지시 | 입고 데이터 기반 계산서 자동 생성·수불 관리 |
| 매출·마진 현황 | 3사 매출/마진/커미션 분석 대시보드 |
| 현대제철 AL30 | 10일 단위 계산서·60일 어음·부족분 커미션 관리 |
| 페로실리콘 (FeSi) | BL 날짜 환율 관리·USD/KRW 계산서 일정 |
| 품목 설정 | 품목 등록·수정 + **공휴일 관리**(지급일 휴일 보정 기준) |
| 비용 정산 | 공동 비용 입력 및 3사 정산 |
| 커미션 관리 | 동국제강·현대제철 커미션 입력, 1/3 배분 |
| 실물 계산서 대사 | 생성값 vs 실제 세금계산서 대조 (지급 일정 화면) |

## 계정 및 권한

아이디 3개로 로그인합니다(이메일이 아니라 `kim` / `choi` / `cho`).

| 아이디 | 표시 이름 | 권한 |
|---|---|---|
| `cho` | (주)금화 조중호 대표님 | 입력·수정·삭제 |
| `kim` | (주)나성 김주종 대표님 | 조회 전용 |
| `choi` | (주)한국에이원 최성호 대표님 | 조회 전용 |

- 역할은 `user_roles` 테이블에 저장되며, 행이 없는 계정은 접근이 거부됩니다.
- 실제 권한 경계는 서버 액션의 `requireOwner()`입니다. 화면에서 버튼을 숨기는 건 편의일 뿐입니다.
- 한 번 로그인하면 쿠키로 유지됩니다(400일, httpOnly). 공용 PC에서는 로그아웃하세요.

계정 생성·비밀번호 변경:

```bash
npm run seed:users -- "<비밀번호>"
```

`.env.local`의 service role 키로 동작하며, 비밀번호는 인자로만 받습니다(소스에 넣지 않음).
이미 있는 계정은 비밀번호만 재설정됩니다.

---

## 기술 스택

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase (PostgreSQL + RLS)
- **Auth**: Supabase Auth (아이디 로그인 + 역할 기반 권한)
- **Styling**: Tailwind CSS
- **Deploy**: Vercel

---

## 로컬 개발

### 1. 저장소 클론

```bash
git clone <repo-url>
cd sales-manager
npm install
```

### 2. 환경변수 설정

`.env.local` 파일을 생성하고 아래 값을 입력합니다.

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

> `SUPABASE_SERVICE_ROLE_KEY`는 서버 액션 전용(`createAdminClient`)입니다.
> 계산서 생성·감가 저장이 이 키로 동작하므로 없으면 저장이 전부 실패합니다.
> **서버 전용 값이므로 `NEXT_PUBLIC_` 접두사를 붙이면 안 됩니다.**

### 3. 개발 서버 실행

```bash
npm run dev
```

`http://localhost:3000` 에서 확인합니다.

---

## Vercel 배포

### 필요한 환경변수

Vercel 대시보드 → 프로젝트 → **Settings > Environment Variables** 에서 아래 2개를 등록합니다.

| 변수명 | 설명 | 예시 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) 키 | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 액션용 service role 키 (비공개) | `sb_secret_...` |

세 값 모두 Supabase 대시보드 → **Project Settings > API** 에서 확인할 수 있습니다.

### 배포 절차

1. GitHub 저장소에 코드를 푸시합니다.

   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```

2. [vercel.com](https://vercel.com) 에서 **Add New Project** → GitHub 저장소 선택

3. **Environment Variables** 탭에서 위 2개 변수 입력

4. **Deploy** 클릭

5. 배포 완료 후 Supabase 대시보드 → **Authentication > URL Configuration** 에서
   **Site URL** 및 **Redirect URLs** 에 Vercel 도메인을 추가합니다.

   ```
   Site URL:      https://<your-app>.vercel.app
   Redirect URLs: https://<your-app>.vercel.app/**
   ```

### Supabase 마이그레이션

초기 DB 설정은 `supabase/migrations/` 폴더의 SQL 파일을 **번호 순서대로**
Supabase SQL Editor에서 실행합니다 (`001` ~ 최신). CLI 연동은 없으므로
새 마이그레이션도 같은 방식으로 직접 실행해야 하며, **코드 배포보다 먼저**
실행해야 합니다 — 컬럼이 없는 상태로 새 코드가 뜨면 저장이 실패합니다.

2026-08-11 기준 `020`까지 있으며, 모두 적용 완료 상태입니다.

| 번호 | 내용 | 없으면 |
|---|---|---|
| `017` | 사용자 역할(owner/viewer) + RLS 잠금 | 로그인 불가 |
| `018` | 공휴일 테이블 | 공휴일 관리 화면이 빔 (계산은 코드 시드로 동작) |
| `019` | `updated_at` + 트리거 (낙관적 잠금) | 모든 수정 저장 실패 |
| `020` | 계산서 실물 대사 컬럼 | 계산서 재생성 실패 |

**적용 상태 점검** — 배포 전에 항상 확인하세요:

```bash
npm run check:schema
```

코드가 기대하는 컬럼이 실제 DB에 있는지 읽기 전용으로 검사하고,
빠진 마이그레이션 번호를 알려줍니다.

---

## 환경변수 요약

로컬(`.env.local`)과 Vercel 환경변수에 동일하게 설정합니다.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

> **주의**: `.env.local` 파일은 `.gitignore`에 의해 저장소에 포함되지 않습니다.
> Vercel 환경변수는 Vercel 대시보드에서 별도로 등록해야 합니다.
