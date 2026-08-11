# 판매관리 시스템 — 파일 지도

Next.js App Router + Supabase + Tailwind. 서버 컴포넌트(page.tsx)가 데이터를 가져와 클라이언트 컴포넌트(\*Client.tsx)에 props로 전달하는 패턴.

## 핵심 비즈니스 로직

- `src/lib/margin.ts` — 마진 계산(`calcMarginFromContract`), 3사 1/3 배분(`splitMargin`), 포맷 헬퍼(`fmtKrw`, `fmtNum`)
  - **USD 계약에 환율 없으면 throw** — 데이터 정합성 오류로 처리
- `src/lib/date.ts` — 월 이동(`shiftMonths`), 현재 월 조회, 영업일 보정(`workingDayOnOrAfter`/`OnOrBefore`), 공휴일 표(`setVariableHolidays`로 DB 값 주입)
- `src/lib/supabase/fetch.ts` — `supabaseFetch()` 공통 헬퍼 (에러 시 throw)
- `src/lib/holidays.ts` — **서버 전용**. `holidays` 테이블 조회 + `hydrateHolidays()`(date.ts에 주입) + `uncoveredHolidayYears()`
- `src/lib/reconcile.ts` — 실물 계산서 대사 순수 판정(`diffInvoice`, `summarizeReconciliation`, `parseAmountInput`)
- `src/lib/optimistic.ts` — 낙관적 잠금 공통(`STALE_WRITE_ERROR`, `EditTarget`)
- `src/lib/auth.ts` — **서버 전용**. `getSession()`(레이아웃용) / `requireOwner()`(쓰기 가드)
- `src/lib/account.ts` — 아이디↔이메일 매핑, 표시 이름. 클라이언트에서도 import 가능
- `src/lib/auth-actions.ts` — 로그아웃 서버 액션
- `src/types/` — 도메인별 분리된 타입 파일, `index.ts`가 barrel로 re-export
  - `product.ts` · `contract.ts` · `delivery.ts` · `margin.ts` · `database.ts` · `depreciation.ts` · `expense.ts`

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
| `/products` | `ProductsClient.tsx` | 품목 마스터 관리 + `HolidayPanel.tsx`(공휴일 CRUD) |
| `/expenses` | `ExpensesClient.tsx` | 공동 비용 입력·3사 정산 |
| `/invoices` | `InvoicesClient.tsx` | 계산서 발행 지시, `DepreciationPanel`·`PaymentDialog`·`ReconcileDialog` 포함 |
| `/login` | `LoginForm.tsx` | 아이디 로그인. 인증은 서버 액션 `login/actions.ts` (쿠키 httpOnly 유지 목적) |

> 인증 가드는 `proxy.ts`(미들웨어, 미로그인 리다이렉트) → `(protected)/layout.tsx`(세션·역할 확인) 2단.
> 레이아웃이 `RoleProvider`로 `canEdit`을 내려주고, 클라이언트는 `useCanEdit()`으로 읽는다.

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
- **분탄 월별 감가(렘코 반환 예정)** → `monthly_depreciations` 테이블(품목×납품월), 입력 검증 `lib/depreciation.ts`, 계산서 반영 `coal.ts` genBuntan(동창 매입만 차감, 렘코 매출·커미션 배분은 총액 기준 — 감가는 미배분 보관 후 계약 종료 시 렘코 반환), UI `invoices/DepreciationPanel.tsx`(입력·미정산 누계·정산완료)
- **매입단가 2개 품목(AL40·AL30·AL35B)** → 같은 납품을 **매입단가별로 2건 입력**한다(매출단가는 단일). 현대 AL40·AL30은 물량 반반, **AL35B(2026-07~, 화림)는 화림 매입 실톤수대로 배분**(예: 2026-07 = 236,500원 × 202.905톤 + 330,000원 × 130.846톤). 두 계약의 `invoice_month_offset`을 **반드시 같게** 둘 것 — 다르면 `invoice_month`가 갈려 analytics에서 한쪽이 통째로 누락된다. 집계·계산서 모두 `invoice_month` 하나로만 판단하며 품목별 특수 분기는 없다. 계약 등록은 `contracts/validate.ts`가 `cost_price`가 다르면 기간 겹침을 허용하므로 그대로 2건 등록 가능
  - AL35B는 금화→한국에이원 공급가가 **건별** `(원가 + floor(톤당마진/3)) × 톤`으로 계산된다(`al-series.ts`, `analytics-compute.ts` 양쪽 동일). 라인이 2개가 되면 floor·반올림도 2번 일어나므로 실계산서와 1원 차이가 날 수 있다 — 첫 발행월에 실물 대사 필수
- **AL30 감가(통과형 — 현대 감액 발행 → 화림 회수)** → 같은 `monthly_depreciations` 테이블. `sales_deduct_ym`=매출 감액 납품월, `cost_deduct_ym`=매입 회수 납품월. `al30.ts`가 매출·매입 각각 차감하고 커미션(마진 1/3)도 같이 움직인다. 실입금액 입력은 `invoices/PaymentDialog.tsx` → `recordPaymentShortfall`. 상세 `docs/al30-depreciation-2026-05.md`
- **거래처 부가세 관례가 안 맞으면 실물 세액을 입력** → `monthly_depreciations.cost_vat_actual`(감가 반영 **매입** 계산서의 실제 부가세). 값이 있으면 `genBuntan`·`genAL30`이 계산값을 덮어쓴다. 2026-06 분탄은 라인별 절사(39,233,044)가 실물, **2026-07 분탄은 같은 소수부 구조인데 차감 후 일괄 절사(37,061,476)가 실물** — 한 공식으로 둘 다 못 맞춘다. 공식을 또 바꾸지 말 것, 실물 값을 넣을 것
- **감가 반영 계산서의 부가세는 반드시 라인별** → 매출·매입·커미션 **모두** `vatOverride`로 `calcVat(감가 전) ∓ calcVat(감가분)`. 차감 후 공급가에 일괄 10%를 다시 매기면 실계산서와 1원 어긋난다(예: 커미션 5,161,107 → 일괄 516,111 vs 실제 516,110). 커미션은 `al30.ts`의 `commVat()`, 감가 없는 달은 일괄 10% 그대로
- **지급일 규칙(휴일 보정 방향이 둘)** → `lib/date.ts`. 대금(매출·매입)은 `workingDayOnOrAfter`(휴일이면 **뒤로**), 소괴탄·분탄 **커미션(금화/나성)은 익월10일 + `workingDayOnOrBefore`(휴일이면 앞으로)**. 같은 "익월10일"이라도 방향이 반대다 — `coal.ts`의 `wDue10N`(대금)과 `wComm10N`(커미션)을 헷갈리지 말 것. 공휴일 원본은 `holidays` 테이블(아래 항목 참조)
- **로그인·권한** → Supabase Auth. 아이디(kim/choi/cho)를 `lib/account.ts`가 내부 이메일(`<id>@sales.local`)로 매핑하고 화면 표시 이름(`DISPLAY_NAMES`, 예: cho→"(주)금화 조중호 대표님")도 여기서 나온다. 역할은 `user_roles` 테이블(`owner`=cho 편집, `viewer`=kim·choi 조회 전용).
  - 실제 권한 경계는 **서버 액션의 `requireOwner()` 하나뿐**이다. `useCanEdit()`(RoleProvider)로 버튼을 숨기는 건 UX일 뿐 — 새 mutation 액션을 만들면 반드시 첫 줄에 `requireOwner()`
  - 세션 쿠키는 **httpOnly**(`lib/supabase/cookie-options.ts`). 그래서 로그인·로그아웃은 서버 액션으로만 한다 — 브라우저 supabase 클라이언트는 없앴다(`@supabase/ssr` 브라우저 클라이언트를 다시 쓰면 쿠키를 못 읽어 조용히 깨진다)
  - 계정 생성/비밀번호 변경 → `npm run seed:users -- "<비밀번호>"` (service-role 사용, 비밀번호는 소스에 넣지 않음)
  - 앱의 DB 접근은 전부 service-role이므로 RLS는 `authenticated`에 아무 권한도 주지 않는다(`017_user_roles_and_rls_lockdown.sql`). 새 테이블도 같은 원칙 — 정책 0개 + RLS on
- **공휴일** → `holidays` 테이블(018)이 원본, `date.ts`의 `SEED_VARIABLE_HOLIDAYS`는 시드/폴백. **지급일을 계산하는 경로에서는 계산 직전에 `hydrateHolidays()`를 부를 것** — 안 부르면 코드 시드(마지막 등록 연도까지)로 계산돼 조용히 틀린다. 현재 호출처는 `invoices/actions.ts:regenerateInvoices`와 `invoices/page.tsx`·`products/page.tsx`. 신정·삼일절 같은 고정 공휴일은 코드(`FIXED_HOLIDAYS_MD`)에 남는다. 미등록 연도는 `isHolidayYearCovered()`가 false → 지급일정·품목설정 화면에 경고
- **낙관적 잠금** → `updated_at`(019, 트리거 자동 갱신) + `.eq('updated_at', edit.updatedAt)`. 계약·입고·품목·비용·감가의 **전체 수정**에만 건다. 실패 시 `STALE_WRITE_ERROR`. 단일 필드 토글(정산완료·활성화·지불업체)은 마지막 값이 곧 의도라 걸지 않는다
- **실물 계산서 대사** → `invoice_instructions.actual_supply_amount/actual_vat_amount/reconciled_at`(020), 순수 판정은 `lib/reconcile.ts`, UI는 `ReconcileDialog.tsx`. **재생성 시 보존 대상**이므로 `actions.ts:replaceInvoices`의 보존 쿼리(`is_paid.eq.true,reconciled_at.not.is.null`)와 복원 update에 새 필드를 빠뜨리지 말 것 — 빠뜨리면 재생성 한 번에 대사 기록이 통째로 사라진다. 부가세만 어긋나면 그 값이 곧 `monthly_depreciations.cost_vat_actual`에 넣을 값이다
- **마이그레이션은 수동** → CLI 연동 없음. `supabase/migrations/*.sql`을 Supabase SQL Editor에서 번호순 실행해야 하고, **새 컬럼에 의존하는 코드는 적용 후에 배포**한다. 적용 상태 점검은 `npm run check:schema`(읽기 전용) — 019 미적용 시 모든 수정이 낙관적 잠금 실패로, 020 미적용 시 계산서 재생성이 실패로 나타난다
- **테스트** → `src/__tests__/` (`npm test`). 계산 로직 `margin.test.ts`·`invoice-generator.test.ts`, 지급일·공휴일 `date.test.ts`, 실물 대사 `reconcile.test.ts`

## LLM Wiki

This project maintains an LLM-curated wiki at `wiki/` following Andrej Karpathy's "LLM Wiki" pattern (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

Before answering questions that rely on knowledge accumulated in this project, read `wiki/index.md` (or the relevant shard under `wiki/indexes/` if the wiki has been sharded) and use its one-line summaries to find the pages you need. Cite with `[[wikilinks]]`. If the index does not surface good candidates, fall back to `wiki_search.py` from the `llm-wiki` skill for BM25-ranked retrieval.

To add a new source, follow the `llm-wiki` skill's ingest workflow: decide placement under `wiki/sources/`, `wiki/entities/`, `wiki/concepts/`, or `wiki/synthesis/`; identify touched pages and make surgical `str_replace` updates rather than rewrites; update the index; append a one-line entry to `wiki/log.md`.

Scaling discipline: atomic pages (400-line soft cap, 800-line hard cap), sharded indexes past ~150 pages or 300 index lines, required YAML frontmatter on every page, `[[wikilinks]]` for every cross-reference.

Full conventions live in `wiki/SCHEMA.md`. Treat it as authoritative when it disagrees with this summary.
