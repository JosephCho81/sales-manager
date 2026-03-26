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
| 품목 설정 | 품목 등록·수정 |

## 기술 스택

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase (PostgreSQL + RLS)
- **Auth**: Supabase Auth
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
```

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

두 값 모두 Supabase 대시보드 → **Project Settings > API** 에서 확인할 수 있습니다.

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

초기 DB 설정은 `supabase/migrations/` 폴더의 SQL 파일을 순서대로
Supabase SQL Editor에서 실행합니다.

```
001_initial.sql
002_add_reference_exchange_rate.sql
003_add_delivery_date.sql
004_invoice_type.sql
005_phase4_additions.sql
```

---

## 환경변수 요약

로컬(`.env.local`)과 Vercel 환경변수에 동일하게 설정합니다.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

> **주의**: `.env.local` 파일은 `.gitignore`에 의해 저장소에 포함되지 않습니다.
> Vercel 환경변수는 Vercel 대시보드에서 별도로 등록해야 합니다.
