# 분탄 월별 감가 (렘코 미수) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분탄 감가를 품목×납품월 단위로 입력해 렘코 매출 계산서만 차감(동창 매입은 총액)하고, 선부담 감가를 "렘코 미수"로 월별·누계 추적한다.

**Architecture:** 신규 `monthly_depreciations` 테이블(월 1건) → `fetchInvoiceInputs`가 함께 조회 → `generateInvoices` → `genBuntan(deliveries, ym, monthlyDep)`이 매출 계산서만 차감. 커미션·analytics 마진은 총액 기준 유지(감가는 계약 종료 후 렘코가 전액 회수). invoices 페이지에 감가 입력·누계 패널.

**Tech Stack:** Next.js App Router(서버 액션), Supabase(admin client), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-buntan-depreciation-design.md`

## Global Constraints

- **커밋은 사용자가 명시 요청한 경우에만** 수행. 커밋할 때 **Co-Authored-By 줄 절대 금지** (Vercel Hobby 배포 차단). 커밋 제목은 `feat/fix/test/refactor(scope): ...` 패턴, 본문 한글 OK.
- 돈 계산·입력 검증은 React 비의존 **순수 모듈 + Vitest 테스트**로 (프로젝트 확정 원칙).
- Supabase 프로젝트 ref: `qmewhmgjdctkydgiebvg` (Spark 한도 — 쿼리는 좁게).
- 분탄(BUNTAN)은 `invoice_month_offset=1`: 지급월 M의 계산서는 납품월 M−1 입고분.
- `monthly_depreciations.year_month`는 **납품월** 기준 (지급월 아님).
- 셸: Windows PowerShell 5.1 (`&&` 없음). 테스트는 `npx vitest run <file>` 또는 `npm test`.
- 기존 데이터 회귀 금지: 월별 감가 데이터가 없는 과거 월은 계산서 재생성 결과가 기존과 동일해야 한다 (건별 `deliveries.depreciation_amount` 로직 유지).

---

### Task 1: DB 마이그레이션 + 도메인 타입

**Files:**
- Create: `supabase/migrations/014_monthly_depreciations.sql`
- Create: `src/types/depreciation.ts`
- Modify: `src/types/index.ts` (barrel export 추가)

**Interfaces:**
- Produces: DB 테이블 `monthly_depreciations`, 타입 `MonthlyDepreciation` (`@/types`에서 import 가능)

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/014_monthly_depreciations.sql`:

```sql
-- 품목×납품월 단위 감가 (동국제강 월말 일괄 통보 — 분탄 렘코 미수)
-- 렘코 매출 계산서만 차감, 동창 매입은 총액 → 감가는 계약 종료 후 렘코가 일괄 지급
CREATE TABLE monthly_depreciations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  year_month  TEXT NOT NULL CHECK (year_month ~ '^\d{4}-\d{2}$'),
  amount      NUMERIC NOT NULL CHECK (amount > 0),
  memo        TEXT,
  settled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, year_month)
);

ALTER TABLE monthly_depreciations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON monthly_depreciations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Supabase에 적용**

Supabase MCP 도구 `apply_migration`으로 위 SQL을 적용 (name: `monthly_depreciations`, project ref `qmewhmgjdctkydgiebvg`). MCP를 쓸 수 없으면 사용자에게 Supabase 대시보드 SQL Editor 실행을 요청하고 확인받은 뒤 진행.

- [ ] **Step 3: 적용 확인**

`list_tables` 또는 `execute_sql`로 `select * from monthly_depreciations limit 1;` 실행 → 0행, 에러 없음 확인.

- [ ] **Step 4: 도메인 타입 작성**

`src/types/depreciation.ts`:

```ts
export interface MonthlyDepreciation {
  id: string
  product_id: string
  /** 납품월 'YYYY-MM' (지급월 아님 — 분탄 offset=1이면 지급월 −1) */
  year_month: string
  amount: number
  memo: string | null
  /** 렘코 정산(회수) 완료 시각. null = 미정산 */
  settled_at: string | null
  created_at: string
}
```

`src/types/index.ts` 끝에 추가:

```ts
export type { MonthlyDepreciation } from './depreciation'
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋 (사용자가 커밋 진행을 승인한 경우에만)**

```bash
git add supabase/migrations/014_monthly_depreciations.sql src/types/depreciation.ts src/types/index.ts
git commit -m "feat(db): monthly_depreciations 테이블 + 타입 (분탄 월별 감가)"
```

---

### Task 2: genBuntan 월별 감가 (TDD)

**Files:**
- Modify: `src/lib/invoice-generator/coal.ts:70-121` (genBuntan)
- Test: `src/__tests__/invoice-generator.test.ts` (genBuntan describe 뒤에 추가)

**Interfaces:**
- Produces: `genBuntan(deliveries: DeliveryForInvoice[], ym: string, monthlyDep?: number): InvoiceToCreate[]` — 세 번째 인자 기본값 0

- [ ] **Step 1: 실패하는 테스트 작성**

`src/__tests__/invoice-generator.test.ts`의 `describe('genBuntan', ...)` 블록 안 마지막에 추가:

```ts
  describe('월별 감가 (렘코 미수 — 2026-07 상장 대응)', () => {
    // sell 200_000 × 10톤 = 2_000_000 / cost 180_000 × 10톤 = 1_800_000
    it('매출(렘코) 계산서만 차감, 매입(동창)은 총액', () => {
      const [sales, cost] = genBuntan([d], '2024-02', 100_000)
      expect(sales.supply_amount).toBe(1_900_000)
      expect(cost.supply_amount).toBe(1_800_000)
    })

    it('커미션은 월별 감가 제외한 총액 기준 (과소지급 방지)', () => {
      const withDep = genBuntan([d], '2024-02', 100_000)
      const noDep   = genBuntan([d], '2024-02')
      expect(withDep[2].supply_amount).toBe(noDep[2].supply_amount)
      expect(withDep[3].supply_amount).toBe(noDep[3].supply_amount)
    })

    it('monthlyDep 미전달 — 기존 금액 불변 (과거 월 회귀)', () => {
      const [sales, cost] = genBuntan([d], '2024-02')
      expect(sales.supply_amount).toBe(2_000_000)
      expect(cost.supply_amount).toBe(1_800_000)
    })

    it('건별 감가(과거 데이터)와 월별 감가 동시 존재 시 각각 반영', () => {
      const legacy = makeDelivery({
        product_name: 'BUNTAN',
        depreciation_amount: 50_000,
        contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
      })
      const [sales, cost] = genBuntan([legacy], '2024-02', 100_000)
      expect(sales.supply_amount).toBe(1_850_000) // 2M − 50k(건별) − 100k(월별)
      expect(cost.supply_amount).toBe(1_750_000)  // 1.8M − 50k(건별)만
    })
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/invoice-generator.test.ts`
Expected: 신규 테스트 중 "매출(렘코) 계산서만 차감…" 등 FAIL (genBuntan이 3번째 인자를 무시)

- [ ] **Step 3: genBuntan 구현**

`coal.ts`의 `genBuntan`을 다음과 같이 수정 (시그니처 + 매출 계산서 supply/memo만 변경, 커미션 계산은 그대로):

```ts
export function genBuntan(
  deliveries: DeliveryForInvoice[],
  ym: string,
  /** 해당 납품월의 월별 감가(원). 렘코 매출 계산서에서만 차감 — 동창 매입·커미션은 총액 기준 */
  monthlyDep: number = 0,
): InvoiceToCreate[] {
```

기존 `sellTotal`/`costTotal`/`splitMargin` 계산은 그대로 두고(커미션은 감가 제외한 실질 마진 — 렘코 입금도 계약 종료 후 회수로 총액 기준), 매출 계산서만:

```ts
    makeInvoice({
      yearMonth: ym, deliveryYearMonth: deliveryYM, productId: pid, deliveryIds: ids,
      from: '렘코', to: '(주)한국에이원', supply: sellTotal - monthlyDep, vat: true,
      basisDate: wBasisM, deadline: wDue1N, paymentDue: wDue10N,
      type: 'sales',
      memo: monthlyDep > 0
        ? `렘코 역발행 — 매출 (VAT10%), 월감가 ${monthlyDep.toLocaleString('ko-KR')}원 차감`
        : '렘코 역발행 — 매출 (VAT10%), 익월1일 동시 발행',
    }),
```

파일 상단 주석(1~11행)의 분탄 설명도 갱신: `분탄: ... 월별 감가(monthlyDep)는 렘코 매출 계산서만 차감 — 렘코 미수, 계약 종료 후 일괄 회수`.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/__tests__/invoice-generator.test.ts`
Expected: 전체 PASS (기존 테스트 포함)

- [ ] **Step 5: 커밋 (사용자 승인 시에만)**

```bash
git add src/lib/invoice-generator/coal.ts src/__tests__/invoice-generator.test.ts
git commit -m "feat(invoices): genBuntan 월별 감가 — 렘코 매출만 차감, 커미션 총액 기준"
```

---

### Task 3: 파이프라인 연결 (generateInvoices → fetchInvoiceInputs → regenerateInvoices)

**Files:**
- Modify: `src/lib/invoice-generator/index.ts` (generateInvoices 시그니처 + BUNTAN 분기)
- Modify: `src/app/(protected)/invoices/invoice-data.ts` (monthly_depreciations 조회)
- Modify: `src/app/(protected)/invoices/actions.ts:40` (generateInvoices 호출)
- Test: `src/__tests__/invoice-generator.test.ts`

**Interfaces:**
- Consumes: Task 2의 `genBuntan(group, ym, monthlyDep)`
- Produces:
  - `generateInvoices(deliveries, yearMonth, monthlyDeps?: MonthlyDepInput[])`, `export type MonthlyDepInput = { product_id: string; year_month: string; amount: number }`
  - `InvoiceInputs`에 `monthlyDeps: MonthlyDepInput[]` 필드 추가 (`fetchInvoiceInputs` 반환)

- [ ] **Step 1: 실패하는 라우팅 테스트 작성**

`invoice-generator.test.ts` 파일 끝에 추가:

```ts
// ── generateInvoices 월별 감가 라우팅 ─────────────────────
describe('generateInvoices 월별 감가 라우팅', () => {
  it('BUNTAN 그룹의 product_id+납품월에 매칭되는 감가만 전달', () => {
    const d = makeDelivery({
      product_name: 'BUNTAN', product_id: 'prod-b', year_month: '2026-07',
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const invoices = generateInvoices([d], '2026-08', [
      { product_id: 'prod-b', year_month: '2026-07', amount: 100_000 },
      { product_id: 'prod-b', year_month: '2026-06', amount: 999_999 }, // 다른 달 — 무시
      { product_id: 'other',  year_month: '2026-07', amount: 999_999 }, // 다른 품목 — 무시
    ])
    const sales = invoices.find(i => i.invoice_type === 'sales')!
    expect(sales.supply_amount).toBe(1_900_000)
    const cost = invoices.find(i => i.invoice_type === 'cost')!
    expect(cost.supply_amount).toBe(1_800_000)
  })

  it('monthlyDeps 미전달 — 기존 동작 불변', () => {
    const d = makeDelivery({
      product_name: 'BUNTAN', product_id: 'prod-b', year_month: '2026-07',
      contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
    })
    const sales = generateInvoices([d], '2026-08').find(i => i.invoice_type === 'sales')!
    expect(sales.supply_amount).toBe(2_000_000)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/invoice-generator.test.ts`
Expected: 첫 테스트 FAIL (generateInvoices가 3번째 인자 무시 → 2_000_000)

- [ ] **Step 3: index.ts 구현**

`src/lib/invoice-generator/index.ts`:

```ts
/** 월별 감가 입력 — year_month는 납품월 기준 */
export type MonthlyDepInput = { product_id: string; year_month: string; amount: number }

export function generateInvoices(
  deliveries: DeliveryForInvoice[],
  yearMonth: string,
  monthlyDeps: MonthlyDepInput[] = [],
): InvoiceToCreate[] {
```

BUNTAN 분기 교체:

```ts
    } else if (name === 'BUNTAN') {
      // genBuntan은 group[0].year_month를 납품월로 사용 — 감가도 동일 기준 매칭
      const dep = monthlyDeps
        .filter(md => md.product_id === group[0].product_id && md.year_month === group[0].year_month)
        .reduce((s, md) => s + Number(md.amount), 0)
      result.push(...genBuntan(group, yearMonth, dep))
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/__tests__/invoice-generator.test.ts`
Expected: 전체 PASS

- [ ] **Step 5: fetchInvoiceInputs에 감가 조회 추가**

`src/app/(protected)/invoices/invoice-data.ts`:

import에 `MonthlyDepInput` 추가:

```ts
import type { DeliveryRawForInvoice, FxRateRaw, CommissionForInvoice, MonthlyDepInput } from '@/lib/invoice-generator'
```

(`index.ts`가 `export type { MonthlyDepInput }`를 barrel로 내보내는지 확인 — Step 3에서 `export type MonthlyDepInput`으로 선언했으므로 자동 export됨)

`InvoiceInputs`에 필드 추가:

```ts
export type InvoiceInputs = {
  deliveries: DeliveryRawForInvoice[]
  fxRates: FxRateRaw[]
  commissions: CommissionForInvoice[]
  monthlyDeps: MonthlyDepInput[]
}
```

함수 끝의 `return` 직전(deliveryMap 조립 후)에 순차 조회 추가:

```ts
  const dedupedDeliveries = Array.from(deliveryMap.values())

  // 월별 감가 — 조회된 납품월들만 좁게 조회 (분탄 offset=1: 지급월 M → 납품월 M−1)
  const ymList = Array.from(new Set(dedupedDeliveries.map(d => d.year_month)))
  let monthlyDeps: MonthlyDepInput[] = []
  if (ymList.length > 0) {
    const mdRes = await supabase
      .from('monthly_depreciations')
      .select('product_id, year_month, amount')
      .in('year_month', ymList)
    // 조용히 빈 배열로 폴백하면 감가 누락된 총액 계산서가 발행됨 — 명시적 throw
    if (mdRes.error) throw new Error(`월별 감가 조회 실패: ${mdRes.error.message}`)
    monthlyDeps = ((mdRes.data ?? []) as MonthlyDepInput[]).map(md => ({ ...md, amount: Number(md.amount) }))
  }

  return {
    deliveries: dedupedDeliveries,
    fxRates: (fxRes.data ?? []) as unknown as FxRateRaw[],
    commissions,
    monthlyDeps,
  }
```

(기존 `return { deliveries: Array.from(deliveryMap.values()), ... }`를 위 형태로 교체)

- [ ] **Step 6: regenerateInvoices에서 전달**

`src/app/(protected)/invoices/actions.ts:40` 변경:

```ts
  const rows = [
    ...generateInvoices(mapped, yearMonth, inputs.monthlyDeps),
    ...generateCommissionInvoices(inputs.commissions, yearMonth),
  ]
```

- [ ] **Step 7: 전체 테스트 + 타입체크**

Run: `npm test` 그리고 `npx tsc --noEmit`
Expected: 전체 PASS, 타입 에러 없음

- [ ] **Step 8: 커밋 (사용자 승인 시에만)**

```bash
git add src/lib/invoice-generator/index.ts "src/app/(protected)/invoices/invoice-data.ts" "src/app/(protected)/invoices/actions.ts" src/__tests__/invoice-generator.test.ts
git commit -m "feat(invoices): 월별 감가를 계산서 생성 파이프라인에 연결"
```

---

### Task 4: 감가 입력 검증(순수) + CRUD 서버 액션 + 재생성 트리거

**Files:**
- Create: `src/lib/depreciation.ts`
- Create: `src/__tests__/depreciation.test.ts`
- Create: `src/app/(protected)/invoices/depreciation-actions.ts`

**Interfaces:**
- Consumes: Task 3의 `regenerateInvoices(yearMonth)` (`./actions`에서 import — 이미 export된 서버 액션)
- Produces:
  - `parseMonthlyDepInput(raw): { ok: true; year_month; amount; memo } | { ok: false; error }` (`@/lib/depreciation`)
  - `sumUnsettled(deps: Array<{ amount: number; settled_at: string | null }>): number` (`@/lib/depreciation`)
  - 서버 액션: `upsertMonthlyDepreciation(input)`, `deleteMonthlyDepreciation(id)`, `setDepreciationSettled(id, settled)` — 모두 `{ error?: string }` 형태 반환

- [ ] **Step 1: 실패하는 순수 함수 테스트 작성**

`src/__tests__/depreciation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseMonthlyDepInput, sumUnsettled } from '@/lib/depreciation'

describe('parseMonthlyDepInput', () => {
  it('정상 입력 — 숫자 문자열/콤마 허용, memo trim', () => {
    const r = parseMonthlyDepInput({ year_month: '2026-07', amount: '1,000,000', memo: ' 7월분 ' })
    expect(r).toEqual({ ok: true, year_month: '2026-07', amount: 1_000_000, memo: '7월분' })
  })

  it('음수/0/소수/비숫자 거부', () => {
    for (const bad of ['-1000', '0', '100.5', 'abc', '']) {
      expect(parseMonthlyDepInput({ year_month: '2026-07', amount: bad }).ok).toBe(false)
    }
  })

  it('월 형식 검증 — YYYY-MM만 허용', () => {
    for (const bad of ['2026-13', '2026-7', '202607', '2026-07-01']) {
      expect(parseMonthlyDepInput({ year_month: bad, amount: '1000' }).ok).toBe(false)
    }
  })

  it('빈 memo → null', () => {
    const r = parseMonthlyDepInput({ year_month: '2026-07', amount: 1000 })
    expect(r).toEqual({ ok: true, year_month: '2026-07', amount: 1000, memo: null })
  })
})

describe('sumUnsettled', () => {
  it('settled_at null만 합산', () => {
    expect(sumUnsettled([
      { amount: 100_000, settled_at: null },
      { amount: 50_000,  settled_at: '2026-10-01T00:00:00Z' },
      { amount: 30_000,  settled_at: null },
    ])).toBe(130_000)
  })

  it('빈 배열 → 0', () => {
    expect(sumUnsettled([])).toBe(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/depreciation.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 순수 모듈 구현**

`src/lib/depreciation.ts`:

```ts
/**
 * 월별 감가 (분탄 렘코 미수) — 입력 검증·누계 계산 순수 함수
 * 돈 입력은 결정적 검증: 음수/0/소수/비숫자 거부, 월 형식 강제
 */

export type MonthlyDepInputRaw = {
  year_month: string
  amount: string | number
  memo?: string | null
}

export type ParsedMonthlyDep =
  | { ok: true; year_month: string; amount: number; memo: string | null }
  | { ok: false; error: string }

export function parseMonthlyDepInput(raw: MonthlyDepInputRaw): ParsedMonthlyDep {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.year_month)) {
    return { ok: false, error: '월 형식이 잘못되었습니다 (YYYY-MM).' }
  }
  const amount = typeof raw.amount === 'number'
    ? raw.amount
    : Number(String(raw.amount).replace(/,/g, '').trim() || NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: '감가 금액은 0보다 큰 숫자여야 합니다.' }
  }
  if (!Number.isInteger(amount)) {
    return { ok: false, error: '감가 금액은 원 단위 정수여야 합니다.' }
  }
  return { ok: true, year_month: raw.year_month, amount, memo: raw.memo?.trim() || null }
}

export function sumUnsettled(deps: Array<{ amount: number; settled_at: string | null }>): number {
  return deps
    .filter(d => d.settled_at === null)
    .reduce((s, d) => s + Number(d.amount), 0)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/__tests__/depreciation.test.ts`
Expected: 전체 PASS

- [ ] **Step 5: 서버 액션 구현**

먼저 `src/lib/audit.ts`를 Read해 `logAudit`의 `action` 허용 값을 확인하고, 아래 코드의 `'insert'`/`'delete'`가 union에 없으면 그 파일의 실제 값에 맞춘다.

`src/app/(protected)/invoices/depreciation-actions.ts`:

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { parseMonthlyDepInput } from '@/lib/depreciation'
import { regenerateInvoices } from './actions'

/**
 * 감가 변경 후 영향받는 지급월 계산서 재생성.
 * 해당 품목·납품월의 deliveries.invoice_month를 조회해 계산서가 이미 있는 월만 재생성
 * (없으면 스킵 — 최초 생성 시 fetchInvoiceInputs가 감가를 포함하므로 자동 반영).
 */
async function regenAffectedMonths(productId: string, yearMonth: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('deliveries')
    .select('invoice_month')
    .eq('product_id', productId)
    .eq('year_month', yearMonth)
  if (error) return `납품 조회 실패: ${error.message}`

  const months = Array.from(new Set(
    (data ?? []).map(d => d.invoice_month).filter((m): m is string => !!m)
  ))
  for (const m of months) {
    const { count, error: cErr } = await supabase
      .from('invoice_instructions')
      .select('id', { count: 'exact', head: true })
      .eq('year_month', m)
    if (cErr) return `계산서 조회 실패: ${cErr.message}`
    if (!count) continue
    const res = await regenerateInvoices(m)
    if (res.error) return `계산서 재생성 실패(${m}): ${res.error}`
  }
  return null
}

export async function upsertMonthlyDepreciation(input: {
  id?: string
  product_id: string
  year_month: string
  amount: string | number
  memo?: string | null
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }
  if (!input.product_id) return { error: '품목이 지정되지 않았습니다.' }
  const parsed = parseMonthlyDepInput(input)
  if (!parsed.ok) return { error: parsed.error }

  const supabase = createAdminClient()
  const row = {
    product_id: input.product_id,
    year_month: parsed.year_month,
    amount: parsed.amount,
    memo: parsed.memo,
  }
  const q = input.id
    ? supabase.from('monthly_depreciations').update(row).eq('id', input.id).select('id')
    : supabase.from('monthly_depreciations').insert(row).select('id')
  const { data, error } = await q
  if (error) {
    if (error.code === '23505') return { error: '해당 품목·월의 감가가 이미 있습니다. 기존 항목을 수정하세요.' }
    return { error: error.message }
  }
  if (!data || data.length === 0) return { error: '대상 감가가 없습니다. 새로고침 후 다시 시도하세요.' }
  await logAudit(auth.user, {
    table: 'monthly_depreciations', rowId: data[0].id,
    action: input.id ? 'update' : 'insert', after: row,
  })

  const regenErr = await regenAffectedMonths(input.product_id, parsed.year_month)
  if (regenErr) return { error: `감가는 저장됐지만 ${regenErr} — 지급 일정에서 "재생성"을 눌러 주세요.` }
  return { success: true }
}

export async function deleteMonthlyDepreciation(id: string): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('monthly_depreciations')
    .delete()
    .eq('id', id)
    .select('product_id, year_month')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: '대상 감가가 없습니다. 새로고침 후 다시 시도하세요.' }
  await logAudit(auth.user, { table: 'monthly_depreciations', rowId: id, action: 'delete', after: null })

  const regenErr = await regenAffectedMonths(data[0].product_id, data[0].year_month)
  if (regenErr) return { error: `감가는 삭제됐지만 ${regenErr} — 지급 일정에서 "재생성"을 눌러 주세요.` }
  return { success: true }
}

export async function setDepreciationSettled(id: string, settled: boolean): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const settled_at = settled ? new Date().toISOString() : null
  const { data, error } = await supabase
    .from('monthly_depreciations')
    .update({ settled_at })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: '대상 감가가 없습니다. 새로고침 후 다시 시도하세요.' }
  await logAudit(auth.user, { table: 'monthly_depreciations', rowId: id, action: 'update', after: { settled_at } })
  return { success: true }
}
```

주의: 정산완료(`setDepreciationSettled`)는 계산서 금액에 영향 없으므로 재생성하지 않는다.

- [ ] **Step 6: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋 (사용자 승인 시에만)**

```bash
git add src/lib/depreciation.ts src/__tests__/depreciation.test.ts "src/app/(protected)/invoices/depreciation-actions.ts"
git commit -m "feat(invoices): 월별 감가 CRUD 서버 액션 + 결정적 입력 검증"
```

---

### Task 5: 감가 정산 패널 UI + invoices 페이지 연결

**Files:**
- Create: `src/app/(protected)/invoices/DepreciationPanel.tsx`
- Modify: `src/app/(protected)/invoices/page.tsx` (monthly_depreciations 조회 + prop 전달)
- Modify: `src/app/(protected)/invoices/InvoicesClient.tsx` (패널 렌더 + props 동기화)

**Interfaces:**
- Consumes: Task 4 서버 액션 3종, `sumUnsettled`, Task 1 `MonthlyDepreciation`
- Produces: `<DepreciationPanel productId productLabel deps defaultYearMonth />` (client 컴포넌트)

- [ ] **Step 1: DepreciationPanel 작성**

`src/app/(protected)/invoices/DepreciationPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtKrw } from '@/lib/margin'
import { sumUnsettled } from '@/lib/depreciation'
import { toMessage } from '@/lib/error'
import type { MonthlyDepreciation } from '@/types'
import {
  upsertMonthlyDepreciation,
  deleteMonthlyDepreciation,
  setDepreciationSettled,
} from './depreciation-actions'

export default function DepreciationPanel({
  productId,
  productLabel,
  deps,
  defaultYearMonth,
}: {
  productId: string
  productLabel: string
  deps: MonthlyDepreciation[]
  /** 입력 기본 납품월 — 분탄 offset=1이므로 조회월 −1 */
  defaultYearMonth: string
}) {
  const router = useRouter()
  const [ym, setYm]         = useState(defaultYearMonth)
  const [amount, setAmount] = useState('')
  const [memo, setMemo]     = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const unsettled = sumUnsettled(deps)

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true); setError(null)
    try {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      setAmount(''); setMemo('')
      router.refresh() // 계산서 금액도 서버에서 재생성됨 — 서버 데이터 재조회
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-6 p-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-900">
          {productLabel} 감가 정산
          <span className="ml-1 font-normal text-xs text-gray-400">— 렘코 미수, 계약 종료 후 일괄 회수</span>
        </h3>
        <p className="text-sm">
          미정산 누계 <span className="font-bold text-red-600 tabular-nums">{fmtKrw(unsettled)}</span>
        </p>
      </div>

      {deps.length > 0 && (
        <table className="w-full text-xs mt-3">
          <tbody>
            {deps.map(d => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="py-2 tabular-nums whitespace-nowrap">{d.year_month} 납품분</td>
                <td className="py-2 text-right tabular-nums font-medium whitespace-nowrap">{fmtKrw(Number(d.amount))}</td>
                <td className="py-2 pl-3 text-gray-400">{d.memo}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  {d.settled_at ? (
                    <span className="text-green-600">
                      정산완료
                      <button disabled={busy} className="text-gray-400 underline ml-2"
                        onClick={() => run(() => setDepreciationSettled(d.id, false))}>취소</button>
                    </span>
                  ) : (
                    <>
                      <button disabled={busy} className="text-blue-600 underline"
                        onClick={() => run(() => setDepreciationSettled(d.id, true))}>정산완료</button>
                      <button disabled={busy} className="text-red-400 underline ml-2"
                        onClick={() => {
                          if (confirm(`${d.year_month} 감가 ${fmtKrw(Number(d.amount))}을(를) 삭제할까요?\n해당 월 계산서가 총액으로 재생성됩니다.`)) {
                            run(() => deleteMonthlyDepreciation(d.id))
                          }
                        }}>삭제</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-end gap-2 mt-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-400 mb-1">납품월</label>
          <input type="month" value={ym} onChange={e => setYm(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">감가 금액(원)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="예: 500000" min="1" step="1"
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-32" />
        </div>
        <div className="flex-1 min-w-[8rem]">
          <label className="block text-xs text-gray-400 mb-1">메모</label>
          <input value={memo} onChange={e => setMemo(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full" />
        </div>
        <button disabled={busy || !amount}
          className="btn-primary text-xs disabled:opacity-40"
          onClick={() => run(() => upsertMonthlyDepreciation({ product_id: productId, year_month: ym, amount, memo }))}>
          {busy ? '저장 중…' : '감가 저장'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        저장 시 해당 납품월의 렘코 매출 계산서가 감가 차감 금액으로 재생성됩니다. 동창 매입·커미션은 총액 유지.
      </p>

      {error && <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: page.tsx에서 감가 조회 + 전달**

`src/app/(protected)/invoices/page.tsx`의 `Promise.all` 배열에 4번째 쿼리 추가:

```ts
      // 월별 감가 (분탄 렘코 미수) — 전체 이력 (테이블 소형)
      supabase
        .from('monthly_depreciations')
        .select('*')
        .order('year_month', { ascending: true }),
```

구조 분해를 `const [inputs, iRes, pRes, mdRes] = await Promise.all([...])`로 변경하고 에러 체크 추가:

```ts
    if (mdRes.error) throw new Error(`월별 감가 조회 실패: ${mdRes.error.message}`)
```

`InvoicesClient`에 prop 추가:

```tsx
        initialMonthlyDeps={(mdRes.data ?? []) as unknown as MonthlyDepreciation[]}
```

import: `import type { MonthlyDepreciation } from '@/types'`

- [ ] **Step 3: InvoicesClient에 패널 렌더 + props 동기화**

`src/app/(protected)/invoices/InvoicesClient.tsx`:

imports 추가:

```ts
import { useState, useEffect, useRef, useCallback } from 'react' // 기존 그대로
import { shiftMonths } from '@/lib/date'
import type { MonthlyDepreciation } from '@/types'
import DepreciationPanel from './DepreciationPanel'
```

props에 `initialMonthlyDeps: MonthlyDepreciation[]` 추가.

감가 저장 시 서버가 계산서를 재생성하고 패널이 `router.refresh()`를 호출하므로, 새 서버 props를 state에 반영하는 동기화 effect 추가 (`useState(initialInvoices)` 아래):

```ts
  // router.refresh() 후 서버에서 재생성된 계산서를 state에 반영
  // (key={yearMonth}는 월 변경 시에만 리마운트되므로 effect로 동기화)
  useEffect(() => { setInvoices(initialInvoices) }, [initialInvoices])
```

요약 카드(`{/* 요약 카드 */}` div) 바로 뒤에 패널 렌더:

```tsx
      {/* 분탄 감가 정산 — 렘코 미수 추적 */}
      {(() => {
        const buntan = products.find(p => p.name.toUpperCase() === 'BUNTAN')
        if (!buntan) return null
        return (
          <DepreciationPanel
            productId={buntan.id}
            productLabel={buntan.display_name ?? '분탄'}
            deps={initialMonthlyDeps.filter(d => d.product_id === buntan.id)}
            defaultYearMonth={shiftMonths(yearMonth, -1)}
          />
        )
      })()}
```

- [ ] **Step 4: 타입체크 + 수동 확인**

Run: `npx tsc --noEmit` → 에러 없음
Run: `npm run dev` 후 `/invoices` 접속 → 패널 표시, 감가 저장 → 렘코 매출 계산서 금액이 차감되어 갱신되는지, 삭제 → 총액 복원되는지 확인. (감가 저장/삭제 후 매입·커미션 금액이 변하지 않는 것도 확인)

- [ ] **Step 5: 커밋 (사용자 승인 시에만)**

```bash
git add "src/app/(protected)/invoices/DepreciationPanel.tsx" "src/app/(protected)/invoices/page.tsx" "src/app/(protected)/invoices/InvoicesClient.tsx"
git commit -m "feat(invoices): 분탄 감가 정산 패널 — 월별 입력·미정산 누계·정산완료"
```

---

### Task 6: Analytics 반영 (매출 차감 표시, 마진 불변)

**Files:**
- Modify: `src/app/(protected)/analytics/analytics-types.ts` (ProductRow 필드 + 타입)
- Modify: `src/app/(protected)/analytics/analytics-compute.ts` (buildAllAnalytics 5번째 인자)
- Modify: `src/app/(protected)/analytics/page.tsx` (감가 조회 + 전달)
- Modify: `src/app/(protected)/analytics/ProductTable.tsx` (감가 배지)
- Test: `src/__tests__/analytics-compute.test.ts`

**Interfaces:**
- Consumes: Task 1 테이블
- Produces:
  - `buildAllAnalytics(deliveries, commissions, fromYM, toYM, monthlyDeps?: MonthlyDepForAnalytics[])`
  - `export type MonthlyDepForAnalytics = { product_id: string; year_month: string; amount: number }` (analytics-types)
  - `ProductRow.depreciationKrw: number`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/__tests__/analytics-compute.test.ts` 끝에 추가 (import에 `buildAllAnalytics`와 `DeliveryForAnalytics` 타입이 없으면 추가):

```ts
describe('buildAllAnalytics 월별 감가 (분탄 렘코 미수)', () => {
  const buntanDelivery: DeliveryForAnalytics = {
    id: 'b1', year_month: '2026-07', invoice_month: '2026-08', delivery_date: '2026-07-15',
    product_id: 'prod-b', quantity_kg: 10_000, depreciation_amount: null, fx_rate: null,
    product: { id: 'prod-b', name: 'BUNTAN', display_name: '분탄', buyer: '렘코' },
    contract: { sell_price: 200_000, cost_price: 180_000, currency: 'KRW', reference_exchange_rate: null },
  }

  it('매출만 차감, 매입·마진 불변, depreciationKrw 기록', () => {
    const out = buildAllAnalytics([buntanDelivery], [], '2026-08', '2026-08',
      [{ product_id: 'prod-b', year_month: '2026-07', amount: 100_000 }])
    expect(out.totals.sellKrw).toBe(1_900_000)     // 2_000_000 − 100_000
    expect(out.totals.costKrw).toBe(1_800_000)     // 총액
    expect(out.totals.totalMargin).toBe(200_000)   // 불변
    expect(out.productRows[0].depreciationKrw).toBe(100_000)
    const aug = out.monthlyData.find(m => m.ym === '2026-08')!
    expect(aug.sellKrw).toBe(1_900_000)
  })

  it('매칭되지 않는 감가(다른 품목/월)는 미적용', () => {
    const out = buildAllAnalytics([buntanDelivery], [], '2026-08', '2026-08', [
      { product_id: 'other',  year_month: '2026-07', amount: 999_999 },
      { product_id: 'prod-b', year_month: '2026-06', amount: 999_999 },
    ])
    expect(out.totals.sellKrw).toBe(2_000_000)
    expect(out.productRows[0].depreciationKrw).toBe(0)
  })

  it('monthlyDeps 미전달 — 기존 동작 불변', () => {
    const out = buildAllAnalytics([buntanDelivery], [], '2026-08', '2026-08')
    expect(out.totals.sellKrw).toBe(2_000_000)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/__tests__/analytics-compute.test.ts`
Expected: FAIL (`depreciationKrw` 없음 / 5번째 인자 무시)

- [ ] **Step 3: analytics-types.ts 수정**

```ts
export type MonthlyDepForAnalytics = { product_id: string; year_month: string; amount: number }
```

`ProductRow`에 필드 추가:

```ts
export type ProductRow = MarginTotals & {
  productId: string; name: string; displayName: string; buyer: string
  deliveryYearMonth: string
  sellPricePerTon: number | null
  costPricePerTon: number | null
  /** 월별 감가(원) — 렘코 미수. 매출에서 차감 표시, 마진에는 미반영 */
  depreciationKrw: number
}
```

- [ ] **Step 4: analytics-compute.ts 수정**

import에 `MonthlyDepForAnalytics` 추가. `buildAllAnalytics` 시그니처:

```ts
export function buildAllAnalytics(
  deliveries: DeliveryForAnalytics[],
  commissions: CommissionEntry[],
  fromYM: string,
  toYM: string,
  monthlyDeps: MonthlyDepForAnalytics[] = [],
): AllAnalytics {
```

델리버리 패스에서 key → invoice_month 추적 맵 추가 (`productMap` 선언 옆):

```ts
  const keyToInvoiceMonth = new Map<string, string>()
```

`if (d.product) {` 블록 안에서 `const key = ...` 다음 줄에:

```ts
      keyToInvoiceMonth.set(key, d.invoice_month)
```

신규 ProductRow 생성 객체에 `depreciationKrw: 0` 추가:

```ts
        const row: ProductRow = {
          ...zeroTotals(),
          productId: d.product_id, name: d.product.name,
          displayName: d.product.display_name, buyer: d.product.buyer,
          deliveryYearMonth: d.year_month,
          sellPricePerTon: m.sell_price_krw,
          costPricePerTon: m.cost_price_krw,
          depreciationKrw: 0,
        }
```

deliveries 패스(1) 종료 직후, commissions 패스(2) 앞에 추가:

```ts
  // ─── 1.5) 월별 감가 (분탄 렘코 미수) — 매출만 차감, 마진 불변 ───
  for (const md of monthlyDeps) {
    const key = `${md.product_id}_${md.year_month}`
    const row = productMap.get(key)
    if (!row) continue // 필터로 제외됐거나 해당 납품 없음
    const amt = Number(md.amount)
    row.sellKrw         -= amt
    row.depreciationKrw += amt
    totals.sellKrw      -= amt
    const im = keyToInvoiceMonth.get(key)
    const ma = im ? monthlyMap.get(im) : undefined
    if (ma) ma.sellKrw -= amt
  }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/__tests__/analytics-compute.test.ts`
Expected: 전체 PASS (기존 테스트 포함 — 기존 테스트에서 ProductRow 리터럴을 직접 만드는 곳이 있으면 `depreciationKrw: 0` 추가)

- [ ] **Step 6: analytics/page.tsx 감가 조회 + 전달**

`fetchAnalyticsData`의 `Promise.all`에 3번째 쿼리 추가:

```ts
      // 월별 감가 (분탄 렘코 미수) — offset 0~2 커버를 위해 납품월 하한을 fromYM−2로
      supabase
        .from('monthly_depreciations')
        .select('product_id, year_month, amount')
        .gte('year_month', shiftMonths(fromYM, -2))
        .lte('year_month', toYM),
```

구조 분해 `const [dRes, fxRes, mdRes] = await Promise.all([...])`, 에러 체크:

```ts
    if (mdRes.error) throw new Error(mdRes.error.message)
```

반환에 추가:

```ts
    return {
      deliveries,
      commissions: (cRes.data ?? []) as CommissionEntry[],
      monthlyDeps: ((mdRes.data ?? []) as MonthlyDepForAnalytics[]).map(md => ({ ...md, amount: Number(md.amount) })),
    }
```

**캐시 키 변경 필수**: 반환 형태가 바뀌므로 `['analytics-data']` → `['analytics-data-v2']` (구 캐시에 monthlyDeps가 없어 undefined 전파 방지).

호출부 수정:

```ts
    const precomputed = buildAllAnalytics(filtered, commissions, fromYM, toYM, currentData.monthlyDeps)
```

이전 기간도:

```ts
      prevProductRows = buildAllAnalytics(prevFiltered, prevData.commissions, prevFromYM, prevToYM, prevData.monthlyDeps).productRows
```

import에 `MonthlyDepForAnalytics` 추가 (`./analytics-types`).

- [ ] **Step 7: ProductTable 감가 배지**

`src/app/(protected)/analytics/ProductTable.tsx`의 매출 셀(73행 부근) 교체:

```tsx
                    <td className="table-td text-right tabular-nums whitespace-nowrap">
                      {fmtNum(row.sellKrw, 0)}
                      {row.depreciationKrw > 0 && (
                        <div className="text-[10px] text-red-400 whitespace-nowrap">감가 −{fmtNum(row.depreciationKrw, 0)}</div>
                      )}
                    </td>
```

- [ ] **Step 8: 전체 테스트 + 타입체크**

Run: `npm test` 그리고 `npx tsc --noEmit`
Expected: 전체 PASS. `analytics-change.ts` 등 ProductRow 소비처에서 타입 에러가 나면 해당 위치에 `depreciationKrw: 0` 보완.

- [ ] **Step 9: 커밋 (사용자 승인 시에만)**

```bash
git add "src/app/(protected)/analytics/analytics-types.ts" "src/app/(protected)/analytics/analytics-compute.ts" "src/app/(protected)/analytics/page.tsx" "src/app/(protected)/analytics/ProductTable.tsx" src/__tests__/analytics-compute.test.ts
git commit -m "feat(analytics): 분탄 월별 감가 — 매출 차감 표시, 마진 불변, 감가 배지"
```

---

### Task 7: 납품 폼 — 분탄 건별 감가 입력 숨김

**Files:**
- Modify: `src/app/(protected)/deliveries/useDeliveryForm.ts:54` (isSoggae 추가)
- Modify: `src/app/(protected)/deliveries/DeliveryForm.tsx:234-262` (감가 섹션 조건)

**Interfaces:**
- Consumes: 없음 (독립)
- Produces: `useDeliveryForm` 반환에 `isSoggae: boolean` 추가

- [ ] **Step 1: useDeliveryForm에 isSoggae 추가**

`useDeliveryForm.ts:54` 아래에 추가하고 return 객체에도 포함:

```ts
  const isSoggae = selectedProduct?.name === 'SOGGAE'
```

```ts
  return {
    form, setForm,
    saving, error,
    selectedProduct, isFeSi, isCoal, isSoggae, formYearMonth,
    availableContracts, selectedContract, contractForPreview, mainMargin,
    handleSave,
  }
```

**주의**: `handleSave`의 payload `depreciation_amount` 조건(`isCoal && ...`)은 **변경하지 않는다** — 과거 분탄 납품(건별 감가 보유)을 수정 저장할 때 감가가 유실되면 안 됨.

- [ ] **Step 2: DeliveryForm 감가 섹션 조건 변경**

`DeliveryForm.tsx`에서 hook 구조 분해에 `isSoggae` 추가. 감가 섹션(234행 부근) 조건을:

```tsx
      {/* 감가 — 소괴탄은 건별 입력. 분탄은 월별 감가(지급 일정 페이지)로 이동, 과거 건별 데이터 수정 시에만 노출 */}
      {(isSoggae || (isCoal && form.depreciation_amount !== '')) && form.contract_id && (
```

그 아래에 분탄 안내 추가 (감가 섹션 블록 바로 뒤):

```tsx
      {isCoal && !isSoggae && form.depreciation_amount === '' && form.contract_id && (
        <p className="mb-5 text-xs text-gray-400">
          분탄 감가는 지급 일정 페이지의 &ldquo;감가 정산&rdquo; 패널에서 월별로 입력합니다.
        </p>
      )}
```

- [ ] **Step 3: 타입체크 + 수동 확인**

Run: `npx tsc --noEmit` → 에러 없음
수동: 납품 등록 폼에서 분탄 선택 → 감가 입력란 없음 + 안내 문구 표시. 소괴탄 선택 → 기존대로 입력란 표시. 건별 감가가 있는 과거 분탄 건 수정 → 입력란 표시(값 보존).

- [ ] **Step 4: 커밋 (사용자 승인 시에만)**

```bash
git add "src/app/(protected)/deliveries/useDeliveryForm.ts" "src/app/(protected)/deliveries/DeliveryForm.tsx"
git commit -m "feat(deliveries): 분탄 건별 감가 입력 숨김 — 월별 감가로 일원화"
```

---

### Task 8: 최종 검증 + 문서 갱신

**Files:**
- Modify: `CLAUDE.md` (파일 지도에 한 줄 추가)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 2: 타입체크 + 빌드**

Run: `npx tsc --noEmit`, 이어서 `npm run build`
Expected: 에러 없음

- [ ] **Step 3: E2E 수동 검증 (dev 서버)**

1. `/invoices?month=2026-08` — 분탄 감가 정산 패널 표시 확인
2. 2026-07 납품분 감가 저장 → 렘코 매출 계산서 supply가 (총액 − 감가)로 갱신, 동창 매입·커미션 불변
3. 같은 월 중복 저장 → "이미 있습니다" 에러
4. `/analytics?month=2026-08` — 분탄 행 매출에 "감가 −X" 배지, 총마진 불변
5. 감가 삭제 → 계산서 총액 복원
6. 정산완료 → 미정산 누계에서 제외, 취소 → 복원
7. 과거 월(감가 없는 달) 계산서 "재생성" → 금액 변화 없음 (회귀 확인)

- [ ] **Step 4: CLAUDE.md 파일 지도 갱신**

"수정 시 주의사항" 섹션에 추가:

```markdown
- **분탄 월별 감가(렘코 미수)** → `monthly_depreciations` 테이블, 입력 검증 `lib/depreciation.ts`, 계산서 반영 `coal.ts` genBuntan(매출만 차감, 커미션 총액 기준), UI `invoices/DepreciationPanel.tsx`
```

- [ ] **Step 5: 커밋 (사용자 승인 시에만)**

```bash
git add CLAUDE.md
git commit -m "docs: 분탄 월별 감가 파일 지도 추가"
```
