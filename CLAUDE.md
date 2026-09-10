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
- **월별 감가는 품목 무관 공통 구조** → `monthly_depreciations` 테이블(품목×납품월), 입력 검증 `lib/depreciation.ts`, UI는 `invoices/DepreciationPanel.tsx` 하나(품목 선택 + 유형 라디오). 유형은 `sales_deduct_ym`이 결정한다
  정산 방식은 `depSettlement()`가 두 컬럼 조합으로 판정한다 (3가지):
  - **보관형** `sales=null, cost=값`: 매입만 차감, 매출·커미션은 총액 유지 → 감가액이 통장에 남아 나중 반환 (분탄→렘코)
  - **통과형·계산서 회수** `sales=값, cost=값`: 매출이 감액 발행돼 마진·커미션이 그달에 −, 회수월 매입에서 + 로 복구 (AL-30→화림)
  - **통과형·별도 정산** `sales=값, cost=null`: 매출만 감액하고 **계산서로는 회수하지 않는다**. 계약 종료 후 현금 정산 (2026-08 소괴탄→렘코, 12월 정산). 정산할 때까지 상단 "미회수" 배너에 남는다
    - `cost_deduct_ym` NULL의 의미가 015("미지정 = 당월 차감")에서 뒤집혔다(021). 코드에 `cost_deduct_ym ?? year_month` 폴백을 **다시 넣지 말 것** — 넣으면 별도 정산분이 조용히 매입에서 이중 회수된다. `MonthlyDepInput`·`MonthlyDepForAnalytics`의 두 월 필드를 필수로 둔 이유도 같다
  - **같은 품목·납품월에 감가가 여러 건 올 수 있다**(현지 통보가 며칠에 걸쳐 나뉨 — 2026-08 소괴탄·분탄 9/3·9/6). 014의 `UNIQUE (product_id, year_month)`가 2건째부터 막고 있었고 **022에서 제거**했다. 반영은 원래부터 합산(`index.ts`의 `slice()`, 배지·산식, analytics 모두 행 단위) — 다시 유니크 제약을 걸지 말 것
  - 단 `cost_vat_actual`은 계산서 **한 장**의 세액이라 합산 불가 — 같은 차감월 감가 중 한 건에만 넣는다. 둘 이상이면 `costDepFor()`가 계산값으로 폴백하고, 패널이 `vatActualConflicts()`로 빨간 경고를 띄운다
  - 이 구분을 계산서 생성부에 전달하는 게 `DepSlice.marginAmount`(types.ts) — **amount는 계산서에서 뺄 금액, marginAmount는 3사 배분에 반영할 금액**. 보관형은 0. 기본값을 두면 한쪽이 조용히 틀리므로 필수 필드다
  - 자동 반영 지원 품목은 `supportsDepreciation()`(index.ts) = 소괴탄·분탄·AL-30·AL-40. AL35B·AL65B·FeSi는 매입 계산서가 여러 장/건별이라 어느 장에서 뺄지 미확정 — UI에서 비활성 + 서버 액션이 거부한다. 규칙이 정해지면 여기부터 열 것
  - 2026-08 소괴탄 감가 212,078원이 분탄 product_id로 저장돼 동창 매입에서 차감된 사고가 있었다. 품목 선택 없는 전용 패널이 원인 — 다시 품목별 패널로 되돌리지 말 것
  - 패널의 각 감가 행 아래에 **그 감가가 실제 반영된 계산서의 배지·산식**을 붙인다(`depImpactsFor`) — 단 `<details>`로 **기본 접힘**. 감가가 여러 건이면 산식이 목록을 덮는다. 표를 스크롤하지 않고 "어느 품목 감가가 어느 계산서를 얼마로 바꿨는지"를 한 곳에서 확인하기 위한 것
  - **계산서 표에는 `badge.short` 한 줄만** 놓는다(전체 문구는 `badge.text` → title 툴팁, 산식은 툴팁과 감가 패널). 표에 산식 블록을 펼치면 행이 4줄로 늘어나 어느 줄에 뭐가 있는지 안 보인다 — 되돌리지 말 것
  - **매출이 여러 장인 품목(AL30 10일 단위 3구간)은 마지막 발행 구간 1장에만 감가가 반영된다**(`al30.ts`의 lastSale). 배지·산식도 그 1장에만 붙여야 하므로 `salesDepTargetIds(invoices)`를 만들어 `depBadgeFor`/`depBreakdownFor`에 넘긴다 — 안 넘기면 차감되지 않은 나머지 2장도 차감된 것처럼 보인다
- **매입단가 2개 품목(AL40·AL30·AL35B)** → 같은 납품을 **매입단가별로 2건 입력**한다(매출단가는 단일). 현대 AL40·AL30은 물량 반반, **AL35B(2026-07~, 화림)는 화림 매입 실톤수대로 배분**(예: 2026-07 = 236,500원 × 202.905톤 + 330,000원 × 130.846톤). 두 계약의 `invoice_month_offset`을 **반드시 같게** 둘 것 — 다르면 `invoice_month`가 갈려 analytics에서 한쪽이 통째로 누락된다. 집계·계산서 모두 `invoice_month` 하나로만 판단하며 품목별 특수 분기는 없다. 계약 등록은 `contracts/validate.ts`가 `cost_price`가 다르면 기간 겹침을 허용하므로 그대로 2건 등록 가능
  - **AL 시리즈 3사 배분은 계산서에 적히는 금액(반올림 후)의 차액을 한 번만 나눈다**(`al-series.ts`). 금화→한국에이원 = `매입총액 + splitMargin(매출총액−매입총액).geumhwa`, 나성 커미션 = `.raseong`. 세 계산서가 서로 물려 있으므로 회사별로 다른 식을 쓰면 안 된다
    - 예전 금화 공식 `(원가 + floor(톤당마진/3)) × 톤`을 **되돌리지 말 것** — 톤당 절사분(최대 0.67원/톤)이 톤수만큼 쌓여 금화가 손해를 본다. 2026-07 AL35B(333.751톤)에서 155원 차이가 나 발행 직전에 발견됐다. 라인별 마진(`Math.round`) 합으로 나누는 것도 안 된다 — 매출−매입과 1원 어긋난다
    - analytics의 `geumhwaSellKrw`도 같은 이유로 절사 없이 누적한다(`analytics-compute.ts`). 단 `a1`/`gm`/`rs`는 여전히 **납품 건별** `splitMargin` 합이라 매입단가 2개 품목에서 계산서와 최대 몇 원 차이가 난다 — 발행 기준은 지급일정(계산서) 쪽
    - **금화→A1 실물 계산서는 "원가 2줄 + 마진 1/3 한 줄"로 발행**한다(2026-07: 47,987,033 / 43,179,180 / 8,548,879 = 99,715,092). 총액을 정수 단가 하나로 못 맞추고(99,715,092 ÷ 333.751 = 298,770.916…), 마진을 단가에 녹이면(274,333.33 / 336,666.67) 라인별 부가세 합이 9,971,510으로 1원 어긋난다. 앞 2줄은 화림 계산서와 동일해 줄 단위 대사가 된다. 상세 `SPEC.md` 4-1
- **AL30 감가(통과형 — 현대 감액 발행 → 화림 회수)** → 같은 `monthly_depreciations` 테이블. `sales_deduct_ym`=매출 감액 납품월, `cost_deduct_ym`=매입 회수 납품월. `al30.ts`가 매출·매입 각각 차감하고 커미션(마진 1/3)도 같이 움직인다. 실입금액 입력은 `invoices/PaymentDialog.tsx` → `recordPaymentShortfall`. 상세 `docs/al30-depreciation-2026-05.md`
- **거래처 부가세 관례가 안 맞으면 실물 세액을 입력** → `monthly_depreciations.cost_vat_actual`(감가 반영 **매입** 계산서의 실제 부가세). 값이 있으면 `genBuntan`·`genAL30`이 계산값을 덮어쓴다. 2026-06 분탄은 라인별 절사(39,233,044)가 실물, **2026-07 분탄은 같은 소수부 구조인데 차감 후 일괄 절사(37,061,476)가 실물** — 한 공식으로 둘 다 못 맞춘다. 공식을 또 바꾸지 말 것, 실물 값을 넣을 것
- **감가 반영 계산서의 부가세는 반드시 라인별** → 매출·매입·커미션 **모두** `vatOverride`로 `calcVat(감가 전) ∓ calcVat(감가분)`. 차감 후 공급가에 일괄 10%를 다시 매기면 실계산서와 1원 어긋난다(예: 커미션 5,161,107 → 일괄 516,111 vs 실제 516,110). 커미션은 `utils.ts`의 `commVat()`(al30·coal 공용), 감가 없는 달은 일괄 10% 그대로
- **지급일 규칙(휴일 보정 방향이 둘)** → `lib/date.ts`. 대금(매출·매입)은 `workingDayOnOrAfter`(휴일이면 **뒤로**), 소괴탄·분탄 **커미션(금화/나성)은 익월10일 + `workingDayOnOrBefore`(휴일이면 앞으로)**. 같은 "익월10일"이라도 방향이 반대다 — `coal.ts`의 `wDue10N`(대금)과 `wComm10N`(커미션)을 헷갈리지 말 것. 공휴일 원본은 `holidays` 테이블(아래 항목 참조)
- **로그인·권한** → Supabase Auth. 아이디(kim/choi/cho)를 `lib/account.ts`가 내부 이메일(`<id>@sales.local`)로 매핑하고 화면 표시 이름(`DISPLAY_NAMES`, 예: cho→"(주)금화 조중호 대표님")도 여기서 나온다. 역할은 `user_roles` 테이블(`owner`=cho 편집, `viewer`=kim·choi 조회 전용).
  - 실제 권한 경계는 **서버 액션의 `requireOwner()` 하나뿐**이다. `useCanEdit()`(RoleProvider)로 버튼을 숨기는 건 UX일 뿐 — 새 mutation 액션을 만들면 반드시 첫 줄에 `requireOwner()`
  - 세션 쿠키는 **httpOnly**(`lib/supabase/cookie-options.ts`). 그래서 로그인·로그아웃은 서버 액션으로만 한다 — 브라우저 supabase 클라이언트는 없앴다(`@supabase/ssr` 브라우저 클라이언트를 다시 쓰면 쿠키를 못 읽어 조용히 깨진다)
  - 계정 생성/비밀번호 변경 → `npm run seed:users -- "<비밀번호>"` (service-role 사용, 비밀번호는 소스에 넣지 않음)
  - 앱의 DB 접근은 전부 service-role이므로 RLS는 `authenticated`에 아무 권한도 주지 않는다(`017_user_roles_and_rls_lockdown.sql`). 새 테이블도 같은 원칙 — 정책 0개 + RLS on
- **공휴일** → `holidays` 테이블(018)이 원본, `date.ts`의 `SEED_VARIABLE_HOLIDAYS`는 시드/폴백. **지급일을 계산하는 경로에서는 계산 직전에 `hydrateHolidays()`를 부를 것** — 안 부르면 코드 시드(마지막 등록 연도까지)로 계산돼 조용히 틀린다. 현재 호출처는 `invoices/actions.ts:regenerateInvoices`와 `invoices/page.tsx`·`products/page.tsx`. 신정·삼일절 같은 고정 공휴일은 코드(`FIXED_HOLIDAYS_MD`)에 남는다. 미등록 연도는 `isHolidayYearCovered()`가 false → 지급일정·품목설정 화면에 경고
- **낙관적 잠금** → `updated_at`(019, 트리거 자동 갱신) + `.eq('updated_at', edit.updatedAt)`. 계약·입고·품목·비용·감가의 **전체 수정**에만 건다. 실패 시 `STALE_WRITE_ERROR`. 단일 필드 토글(정산완료·활성화·지불업체)은 마지막 값이 곧 의도라 걸지 않는다
- **실물 계산서 대사** → `invoice_instructions.actual_supply_amount/actual_vat_amount/reconciled_at`(020), 순수 판정은 `lib/reconcile.ts`, UI는 합계 숫자 옆 인라인 마커(`InvoiceTable.tsx`의 `ReconcileMark` — 미대사 ⊙ / 일치 ✓ / 차이 ⊙+금액) → `ReconcileDialog.tsx`. 합계 칸 **아래** 블록으로 붙이면 열이 두 줄로 늘어나 표가 깨진다. **재생성 시 보존 대상**이므로 `actions.ts:replaceInvoices`의 보존 쿼리(`is_paid.eq.true,reconciled_at.not.is.null`)와 복원 update에 새 필드를 빠뜨리지 말 것 — 빠뜨리면 재생성 한 번에 대사 기록이 통째로 사라진다. 부가세만 어긋나면 그 값이 곧 `monthly_depreciations.cost_vat_actual`에 넣을 값이다
- **마이그레이션은 수동** → CLI 연동 없음. `supabase/migrations/*.sql`을 Supabase SQL Editor에서 번호순 실행해야 하고, **새 컬럼에 의존하는 코드는 적용 후에 배포**한다. 적용 상태 점검은 `npm run check:schema`(읽기 전용) — 019 미적용 시 모든 수정이 낙관적 잠금 실패로, 020 미적용 시 계산서 재생성이 실패로 나타난다
- **테스트** → `src/__tests__/` (`npm test`). 계산 로직 `margin.test.ts`·`invoice-generator.test.ts`, 지급일·공휴일 `date.test.ts`, 실물 대사 `reconcile.test.ts`

## LLM Wiki

This project maintains an LLM-curated wiki at `wiki/` following Andrej Karpathy's "LLM Wiki" pattern (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

Before answering questions that rely on knowledge accumulated in this project, read `wiki/index.md` (or the relevant shard under `wiki/indexes/` if the wiki has been sharded) and use its one-line summaries to find the pages you need. Cite with `[[wikilinks]]`. If the index does not surface good candidates, fall back to `wiki_search.py` from the `llm-wiki` skill for BM25-ranked retrieval.

To add a new source, follow the `llm-wiki` skill's ingest workflow: decide placement under `wiki/sources/`, `wiki/entities/`, `wiki/concepts/`, or `wiki/synthesis/`; identify touched pages and make surgical `str_replace` updates rather than rewrites; update the index; append a one-line entry to `wiki/log.md`.

Scaling discipline: atomic pages (400-line soft cap, 800-line hard cap), sharded indexes past ~150 pages or 300 index lines, required YAML frontmatter on every page, `[[wikilinks]]` for every cross-reference.

Full conventions live in `wiki/SCHEMA.md`. Treat it as authoritative when it disagrees with this summary.
