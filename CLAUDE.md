# 판매관리 시스템 — 파일 지도

Next.js App Router + Supabase + Tailwind. 서버 컴포넌트(page.tsx)가 데이터를 가져와 클라이언트 컴포넌트(\*Client.tsx)에 props로 전달하는 패턴.

## 핵심 비즈니스 로직

- `src/lib/margin.ts` — 마진 계산(`calcMarginFromContract`), 3사 1/3 배분(`splitMargin`), 포맷 헬퍼(`fmtKrw`, `fmtNum`)
- `src/lib/date.ts` — 월 이동(`shiftMonths`), 현재 월 조회
- `src/types/index.ts` — 전체 공유 타입 (Product, Contract, Delivery, FxRate, MarginResult, Database)

## Analytics 페이지 (`src/app/(protected)/analytics/`)

| 파일 | 역할 |
|---|---|
| `page.tsx` | 서버: 쿼리 파라미터 파싱, Supabase 조회, `buildAllAnalytics` 호출 후 Client에 전달 |
| `analytics-compute.ts` | 순수 집계 함수. `buildAllAnalytics`(서버 단일패스), `computeMargins` / `buildProductRows` / `buildMonthlyData`(클라이언트 필터 재계산). `accDelivery` 헬퍼로 누산 통합 |
| `AnalyticsClient.tsx` | 상태 오케스트레이션. 날짜/필터 상태 관리, precomputed vs 재계산 분기 |
| `DateControls.tsx` | 날짜 모드 탭 + 날짜 입력 + 조회 버튼 + 품목/납품처 필터 |
| `SummaryCards.tsx` | 3사(한국에이원/금화/라성) 요약 카드 |
| `ProductTable.tsx` | 품목별 마진 테이블 + 커미션 행(AL35B→동국, AL30→현대) |
| `MarginBarChart.tsx` | Recharts 기반 월별 마진 막대차트 |

> 집계 기준: `invoice_month`(지급 스케줄 월). `year_month`(납품월)은 "N월분" 라벨용

## 기타 페이지

| 경로 | Client 파일 | 역할 |
|---|---|---|
| `/commission` | `CommissionClient.tsx` | 커미션 입력(동국제강/현대제철 섹션), 1/3 배분 미리보기 |
| `/contracts` | `ContractsClient.tsx` | 낙찰단가 계약 CRUD |
| `/deliveries` | `DeliveriesClient.tsx` | 납품 건 CRUD, `MarginPreview.tsx` 포함 |
| `/invoices` | `InvoicesClient.tsx` | 세금계산서 조회/생성 |
| `/products` | `ProductsClient.tsx` | 품목 마스터 관리 |

## 인보이스 생성 (`src/lib/invoice-generator/`)

품목별 Excel 생성 로직. `index.ts` → 라우터, 품목별 파일(al-series, al30, coal, fesi, ...) → 실제 생성.

## 수정 시 주의사항

- **마진 계산 변경** → `margin.ts` 단독 수정, `analytics-compute.ts`의 `accDelivery`는 자동 반영
- **3사 카드 UI** → `SummaryCards.tsx`만 읽으면 됨
- **품목 테이블/커미션 행** → `ProductTable.tsx`만 읽으면 됨
- **날짜/필터 컨트롤** → `DateControls.tsx`만 읽으면 됨
- **집계 로직 버그** → `analytics-compute.ts` 집중
- **커미션** → `CommissionClient.tsx` + `commission/actions.ts`
