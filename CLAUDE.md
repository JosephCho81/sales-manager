# 판매관리 시스템 — 파일 지도

Next.js App Router + Supabase + Tailwind. 서버 컴포넌트(page.tsx)가 데이터를 가져와 클라이언트 컴포넌트(\*Client.tsx)에 props로 전달하는 패턴.

## 핵심 비즈니스 로직

- `src/lib/margin.ts` — 마진 계산(`calcMarginFromContract`), 3사 1/3 배분(`splitMargin`), 포맷 헬퍼(`fmtKrw`, `fmtNum`)
  - **USD 계약에 환율 없으면 throw** — 데이터 정합성 오류로 처리
- `src/lib/date.ts` — 월 이동(`shiftMonths`), 현재 월 조회
- `src/lib/supabase/fetch.ts` — `supabaseFetch()` 공통 헬퍼 (에러 시 throw)
- `src/types/` — 도메인별 분리된 타입 파일, `index.ts`가 barrel로 re-export
  - `product.ts` · `contract.ts` · `delivery.ts` · `margin.ts` · `database.ts`

## Analytics 페이지 (`src/app/(protected)/analytics/`)

| 파일 | 역할 |
|---|---|
| `page.tsx` | 서버: 쿼리 파라미터 파싱(날짜+필터), Supabase 조회, 서버사이드 필터링, `buildAllAnalytics` 호출 후 Client에 전달. raw deliveries는 클라이언트에 전달하지 않음 |
| `analytics-compute.ts` | 순수 집계 함수. **서버 전용**: `buildAllAnalytics`, `extractAvailableProducts`. **클라이언트 호환**: `computeMargins` / `buildProductRows` / `buildMonthlyData` |
| `AnalyticsClient.tsx` | 날짜/필터 URL 상태 관리. 필터 변경 시 즉시 서버 이동 (클라이언트 재계산 없음) |
| `DateControls.tsx` | 날짜 모드 탭 + 날짜 입력 + 조회 버튼. 품목/납품처 필터는 `onFilterChange`로 즉시 이동 |
| `SummaryCards.tsx` | 3사(한국에이원/금화/라성) 요약 카드 |
| `ProductTable.tsx` | 품목별 마진 테이블 + 커미션 행(AL35B→동국, AL30→현대) |
| `MarginBarChart.tsx` | CSS 기반 월별 마진 막대차트 (외부 라이브러리 없음) |

> 집계 기준: `invoice_month`(지급 스케줄 월). `year_month`(납품월)은 "N월분" 라벨용
> 필터(품목/납품처)는 URL 파라미터(`?product=AL35B&buyer=동국제강`)로 관리 — 서버사이드 처리

## 기타 페이지

| 경로 | Client 파일 | 역할 |
|---|---|---|
| `/commission` | `CommissionClient.tsx` | 커미션 입력(동국제강/현대제철 섹션), 1/3 배분 미리보기 |
| `/contracts` | `ContractsClient.tsx` | 낙찰단가 계약 CRUD |
| `/deliveries` | `DeliveriesClient.tsx` | 납품 건 CRUD, `MarginPreview.tsx` 포함 |
| `/products` | `ProductsClient.tsx` | 품목 마스터 관리 |

## 수정 시 주의사항

- **마진 계산 변경** → `margin.ts` 단독 수정, `analytics-compute.ts`의 `accDelivery`는 자동 반영
- **USD 계약 환율 처리** → `calcMarginFromContract`는 환율 없으면 throw. 호출부에서 try/catch 또는 사전 검증 필요
- **3사 카드 UI** → `SummaryCards.tsx`만 읽으면 됨
- **품목 테이블/커미션 행** → `ProductTable.tsx`만 읽으면 됨
- **날짜/필터 컨트롤** → `DateControls.tsx`만 읽으면 됨
- **집계 로직 버그** → `analytics-compute.ts` 집중
- **커미션** → `CommissionClient.tsx` + `commission/actions.ts`
- **납품 폼 로직** → `deliveries/useDeliveryForm.ts` (상태·저장), `DeliveryForm.tsx` (UI만)
- **계약 폼 검증** → `contracts/validate.ts`
- **테스트** → `src/__tests__/margin.test.ts` (`npm test`)
