import { describe, it, expect } from 'vitest'
import {
  parseMonthlyDepInput, sumUnsettled, sumUnrecovered,
  depKind, depSettlement, splitShortfall, parsePaidAmount, depBadgeFor, depBreakdownFor,
  salesDepTargetIds, depImpactsFor, vatActualConflicts,
} from '@/lib/depreciation'
import type { MonthlyDepreciation } from '@/types'

describe('parseMonthlyDepInput', () => {
  it('정상 입력 — 숫자 문자열/콤마 허용, memo trim, 차감월 기본값=당월', () => {
    const r = parseMonthlyDepInput({ year_month: '2026-07', amount: '1,000,000', memo: ' 7월분 ' })
    expect(r).toEqual({
      ok: true, year_month: '2026-07', amount: 1_000_000, memo: '7월분',
      sales_deduct_ym: null, cost_deduct_ym: '2026-07', cost_vat_actual: null,
    })
  })

  it('부가세 실계산서 — 빈 값은 null, 정수는 그대로, 음수·소수는 거부', () => {
    const raw = { year_month: '2026-07', amount: 1000 }
    expect(parseMonthlyDepInput({ ...raw, cost_vat_actual: '' })).toMatchObject({ cost_vat_actual: null })
    expect(parseMonthlyDepInput({ ...raw, cost_vat_actual: '37,061,476' })).toMatchObject({ cost_vat_actual: 37_061_476 })
    // 0은 유효한 입력(면세) — 빈 값과 구분돼야 한다
    expect(parseMonthlyDepInput({ ...raw, cost_vat_actual: 0 })).toMatchObject({ cost_vat_actual: 0 })
    for (const bad of ['-1', '10.5', 'abc']) {
      expect(parseMonthlyDepInput({ ...raw, cost_vat_actual: bad }).ok).toBe(false)
    }
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
    expect(r).toMatchObject({ ok: true, memo: null })
  })

  it('통과형 — 매출 감액월·매입 회수월 분리 저장', () => {
    const r = parseMonthlyDepInput({
      year_month: '2026-05', amount: 56_179,
      sales_deduct_ym: '2026-05', cost_deduct_ym: '2026-07',
    })
    expect(r).toMatchObject({ ok: true, sales_deduct_ym: '2026-05', cost_deduct_ym: '2026-07' })
  })

  it('차감월 형식 오류 거부', () => {
    expect(parseMonthlyDepInput({ year_month: '2026-05', amount: 1000, cost_deduct_ym: '2026-13' }).ok).toBe(false)
    expect(parseMonthlyDepInput({ year_month: '2026-05', amount: 1000, sales_deduct_ym: 'x' }).ok).toBe(false)
  })
})

// ── 유형 분리 ─────────────────────────────────────────────
const hold = { amount: 100_000, settled_at: null, sales_deduct_ym: null }
const pass = { amount: 56_179,  settled_at: null, sales_deduct_ym: '2026-05' }

describe('depKind / 누계', () => {
  it('sales_deduct_ym 유무로 보관형·통과형 구분', () => {
    expect(depKind(hold)).toBe('hold')
    expect(depKind(pass)).toBe('passthrough')
  })

  it('sumUnsettled — 보관형 미정산만 합산 (통과형 제외)', () => {
    expect(sumUnsettled([
      hold,
      { amount: 50_000, settled_at: '2026-10-01T00:00:00Z', sales_deduct_ym: null },
      { amount: 30_000, settled_at: null, sales_deduct_ym: null },
      pass,
    ])).toBe(130_000)
  })

  it('sumUnrecovered — 통과형 미회수만 합산', () => {
    expect(sumUnrecovered([hold, pass])).toBe(56_179)
    expect(sumUnrecovered([{ ...pass, settled_at: '2026-09-30T00:00:00Z' }])).toBe(0)
  })

  it('빈 배열 → 0', () => {
    expect(sumUnsettled([])).toBe(0)
    expect(sumUnrecovered([])).toBe(0)
  })
})

describe('vatActualConflicts', () => {
  const row = (over: Partial<{ product_id: string; cost_deduct_ym: string | null; cost_vat_actual: number | null }>) => ({
    product_id: 'prod-b', cost_deduct_ym: '2026-08', cost_vat_actual: null, ...over,
  })

  it('같은 품목·차감월에 실물 세액이 2건 이상이면 충돌 — 계산서 한 장의 세액은 합칠 수 없다', () => {
    expect(vatActualConflicts([
      row({ cost_vat_actual: 111 }),
      row({ cost_vat_actual: 222 }),
      row({ cost_vat_actual: 333 }),
    ])).toEqual([{ product_id: 'prod-b', cost_deduct_ym: '2026-08', count: 3 }])
  })

  it('한 건만 입력됐거나 품목·차감월이 다르면 충돌 아님', () => {
    expect(vatActualConflicts([
      row({ cost_vat_actual: 111 }),
      row({ cost_vat_actual: null }),
      row({ product_id: 'other', cost_vat_actual: 222 }),
      row({ cost_deduct_ym: '2026-09', cost_vat_actual: 333 }),
    ])).toEqual([])
  })

  it('회수 없는 감가(cost_deduct_ym null)는 매입 계산서가 없어 충돌 대상 아님', () => {
    expect(vatActualConflicts([
      row({ cost_deduct_ym: null, cost_vat_actual: 111 }),
      row({ cost_deduct_ym: null, cost_vat_actual: 222 }),
    ])).toEqual([])
  })

  it('언더스코어가 든 product_id도 차감월을 정확히 분리', () => {
    expect(vatActualConflicts([
      row({ product_id: 'prod_b_1', cost_vat_actual: 1 }),
      row({ product_id: 'prod_b_1', cost_vat_actual: 2 }),
    ])).toEqual([{ product_id: 'prod_b_1', cost_deduct_ym: '2026-08', count: 2 }])
  })
})

// ── 실입금 차액 역산 ───────────────────────────────────────
describe('splitShortfall', () => {
  it('2026-05 AL30 실제 건 — 61,797 = 56,179 + 5,618', () => {
    expect(splitShortfall(61_797, true)).toEqual({ ok: true, diff: 61_797, supply: 56_179, vat: 5_618 })
  })

  it('부가세 없는 계산서는 전액이 공급가액', () => {
    expect(splitShortfall(50_000, false)).toEqual({ ok: true, diff: 50_000, supply: 50_000, vat: 0 })
  })

  it('부가세 규칙과 안 맞는 차액은 거부 — 감가 외 원인', () => {
    // 공급가액+반올림VAT 조합으로 만들 수 없는 금액 (예: 61,792 / 61,803 / 5)
    expect(splitShortfall(61_792, true).ok).toBe(false)
    expect(splitShortfall(61_803, true).ok).toBe(false)
    expect(splitShortfall(5, true).ok).toBe(false)
  })

  it('0·음수·소수 거부', () => {
    for (const bad of [0, -100, 1000.5]) expect(splitShortfall(bad, true).ok).toBe(false)
  })
})

describe('parsePaidAmount', () => {
  it('실제 건 — 차액 61,797 산출', () => {
    expect(parsePaidAmount('159,249,157', 159_310_954)).toEqual({
      ok: true, amount: 159_249_157, diff: 61_797,
    })
  })

  it('총액과 같으면 차액 0', () => {
    expect(parsePaidAmount(131_961_434, 131_961_434)).toMatchObject({ ok: true, diff: 0 })
  })

  it('총액 초과 입금은 거부 (오입력 방지)', () => {
    expect(parsePaidAmount(200, 100).ok).toBe(false)
  })

  it('음수·소수·비숫자 거부', () => {
    for (const bad of ['-1', '10.5', 'abc', '']) expect(parsePaidAmount(bad, 1000).ok).toBe(false)
  })
})

// ── 계산서 배지 (담당자 실수 방지의 핵심) ──────────────────
const AL30 = 'p-al30'
const dep2605: MonthlyDepreciation = {
  id: 'd1', product_id: AL30, year_month: '2026-05', amount: 56_179,
  memo: null, settled_at: null,
  sales_deduct_ym: '2026-05', cost_deduct_ym: '2026-07',
  cost_vat_actual: null,
  created_at: '2026-07-31T00:00:00Z',
}
const inv = (o: Partial<Parameters<typeof depBadgeFor>[0]>) => ({
  invoice_type: 'cost', product_id: AL30, delivery_year_month: '2026-06',
  from_company: '(주)한국에이원', to_company: '화림', ...o,
})

describe('depBadgeFor', () => {
  it('매출(5월분) — 감액 발행 사실 + 회수 예정월 안내', () => {
    const b = depBadgeFor(inv({ invoice_type: 'sales', delivery_year_month: '2026-05', from_company: '현대제철' }), [dep2605])
    expect(b?.tone).toBe('shortfall')
    expect(b?.text).toContain('반영 발행')
    expect(b?.text).toContain('실제 역발행·입금액과 일치')
    expect(b?.text).toContain('7월분 매입에서 회수')
  })

  it('매입 6월분 — "차감 없음" 명시 (이중 차감 방지)', () => {
    const b = depBadgeFor(inv({ delivery_year_month: '2026-06' }), [dep2605])
    expect(b?.tone).toBe('pending')
    expect(b?.text).toContain('차감 없음')
    expect(b?.text).toContain('전액 지급')
    expect(b?.text).toContain('7월분에서 회수 예정')
  })

  it('매입 7월분 — 회수 반영 발행 표시', () => {
    const b = depBadgeFor(inv({ delivery_year_month: '2026-07' }), [dep2605])
    expect(b?.tone).toBe('applied')
    expect(b?.text).toContain('56,179')
    expect(b?.text).toContain('회수 완료')
  })

  it('회수 완료(settled) 후에는 대기 배지를 띄우지 않음', () => {
    const settled = { ...dep2605, settled_at: '2026-09-30T00:00:00Z' }
    expect(depBadgeFor(inv({ delivery_year_month: '2026-06' }), [settled])).toBeNull()
  })

  it('보관형(분탄)은 매출 배지 없음 / 매입은 보관 표시', () => {
    const buntan: MonthlyDepreciation = {
      ...dep2605, id: 'd2', product_id: 'p-buntan', year_month: '2026-06',
      sales_deduct_ym: null, cost_deduct_ym: '2026-06',
    }
    const salesInv = inv({ invoice_type: 'sales', product_id: 'p-buntan', delivery_year_month: '2026-06' })
    expect(depBadgeFor(salesInv, [buntan])).toBeNull()
    const costInv = inv({ product_id: 'p-buntan', delivery_year_month: '2026-06' })
    expect(depBadgeFor(costInv, [buntan])?.tone).toBe('hold')
  })

  it('커미션(5월분) — 감가 차감 마진 기준임을 명시', () => {
    const b = depBadgeFor(inv({ invoice_type: 'commission', delivery_year_month: '2026-05', to_company: '금화' }), [dep2605])
    expect(b?.tone).toBe('shortfall')
    expect(b?.text).toContain('뺀 마진 기준')
    expect(b?.text).toContain('3사가 나눠 부담')
  })

  it('커미션(7월분) — 회수분 포함 마진 기준임을 명시', () => {
    const b = depBadgeFor(inv({ invoice_type: 'commission', delivery_year_month: '2026-07', to_company: '금화' }), [dep2605])
    expect(b?.tone).toBe('applied')
    expect(b?.text).toContain('회수분을 더한 마진 기준')
  })

  it('다른 품목·품목 없는 커미션 계산서는 배지 없음', () => {
    expect(depBadgeFor(inv({ product_id: 'other' }), [dep2605])).toBeNull()
    expect(depBadgeFor(inv({ product_id: null, invoice_type: 'commission' }), [dep2605])).toBeNull()
    // 6월분 커미션 — 감가와 무관한 달
    expect(depBadgeFor(inv({ invoice_type: 'commission', delivery_year_month: '2026-06' }), [dep2605])).toBeNull()
  })
})

// ── 계산서 행 감가 산식 ────────────────────────────────────
describe('depBreakdownFor', () => {
  const amt = (o: Record<string, unknown>) => ({
    invoice_type: 'cost', product_id: AL30, delivery_year_month: '2026-07',
    from_company: '(주)한국에이원', to_company: '화림',
    supply_amount: 0, vat_amount: 0, total_amount: 0, ...o,
  })

  it('매출 감액월 — 반영 전 금액 복원 (실제 2026-05 건)', () => {
    const bd = depBreakdownFor(amt({
      invoice_type: 'sales', delivery_year_month: '2026-05',
      from_company: '현대제철', to_company: '(주)한국에이원',
      supply_amount: 144_771_961, vat_amount: 14_477_196, total_amount: 159_249_157,
    }), [dep2605])!
    expect(bd.grossSupply).toBe(144_828_140)
    expect(bd.grossVat).toBe(14_482_814)
    expect(bd.grossTotal).toBe(159_310_954)
    expect(bd.depTotal).toBe(61_797)
    expect(bd.depVat).toBe(5_618)
    expect(bd.netTotal).toBe(159_249_157)
    expect(bd.originYMs).toEqual(['2026-05'])
  })

  it('매입 회수월 — 화림 계산서 산식', () => {
    const bd = depBreakdownFor(amt({
      supply_amount: 1_000_000, vat_amount: 100_000, total_amount: 1_100_000,
    }), [dep2605])!
    expect(bd.grossSupply).toBe(1_056_179)
    expect(bd.depTotal).toBe(61_797)
    expect(bd.netTotal).toBe(1_100_000)
  })

  it('동창(보관형)은 부가세 절사 관례 적용', () => {
    const buntan: MonthlyDepreciation = {
      ...dep2605, id: 'd3', product_id: 'p-buntan', year_month: '2026-06',
      amount: 180_851, sales_deduct_ym: null, cost_deduct_ym: '2026-06',
    }
    const bd = depBreakdownFor(amt({
      product_id: 'p-buntan', delivery_year_month: '2026-06', to_company: '동창',
      supply_amount: 392_330_439, vat_amount: 39_233_044, total_amount: 431_563_483,
    }), [buntan])!
    expect(bd.depVat).toBe(18_085) // 절사 (반올림이면 18,085.1 → 18,085 동일하나 규칙 명시)
    expect(bd.grossSupply).toBe(392_511_290)
  })

  it('감가 없는 행·커미션 행은 산식 없음', () => {
    expect(depBreakdownFor(amt({ delivery_year_month: '2026-06' }), [dep2605])).toBeNull()
    expect(depBreakdownFor(amt({ invoice_type: 'commission', delivery_year_month: '2026-05' }), [dep2605])).toBeNull()
  })

  it('부가세 없는 계산서는 감가 VAT 0', () => {
    const bd = depBreakdownFor(amt({
      supply_amount: 1_000_000, vat_amount: 0, total_amount: 1_000_000,
    }), [dep2605])!
    expect(bd.depVat).toBe(0)
    expect(bd.depTotal).toBe(56_179)
  })
})


// ── 매출 다중 발행 품목의 감가 대상 1장 ─────────────────────
describe('salesDepTargetIds / depImpactsFor', () => {
  // AL30은 같은 납품월 매출이 10일 단위 3장. 감가는 마지막 발행 구간 1장에만 반영된다
  const salesLine = (id: string, basis: string, supply: number, vat: number) => ({
    id, invoice_type: 'sales', product_id: AL30, delivery_year_month: '2026-05',
    from_company: '현대제철', to_company: '(주)한국에이원',
    invoice_basis_date: basis,
    supply_amount: supply, vat_amount: vat, total_amount: supply + vat,
  })
  const lines = [
    salesLine('s1', '2026-05-11', 50_000_000, 5_000_000),
    salesLine('s2', '2026-05-20', 40_000_000, 4_000_000),
    salesLine('s3', '2026-05-29', 144_771_961, 14_477_196),
  ]

  it('가장 늦은 발행기준일 1장만 감가 대상', () => {
    expect(salesDepTargetIds(lines)).toEqual(new Set(['s3']))
  })

  it('대상 아닌 매출 행은 배지·산식이 나오지 않는다', () => {
    const targets = salesDepTargetIds(lines)
    expect(depBadgeFor(lines[0], [dep2605], targets)).toBeNull()
    expect(depBreakdownFor(lines[0], [dep2605], targets)).toBeNull()
    expect(depBadgeFor(lines[2], [dep2605], targets)).not.toBeNull()
    expect(depBreakdownFor(lines[2], [dep2605], targets)!.grossSupply).toBe(144_828_140)
  })

  it('targets 미전달 시 기존 동작 유지 (전 행 표시)', () => {
    expect(depBadgeFor(lines[0], [dep2605])).not.toBeNull()
  })

  it('depImpactsFor — 매출 감액 1장 + 매입 회수 1장, 매출이 먼저', () => {
    const cost = {
      id: 'c1', invoice_type: 'cost', product_id: AL30, delivery_year_month: '2026-07',
      from_company: '(주)한국에이원', to_company: '화림', invoice_basis_date: '2026-07-31',
      supply_amount: 109_118_861, vat_amount: 10_911_886, total_amount: 120_030_747,
    }
    const impacts = depImpactsFor(dep2605, [...lines, cost], [dep2605])
    expect(impacts.map(i => i.invoiceId)).toEqual(['s3', 'c1'])
    expect(impacts[0].role).toBe('sales')
    expect(impacts[1].breakdown!.grossTotal).toBe(120_092_544)
    expect(impacts[1].breakdown!.depTotal).toBe(61_797)
  })

  it('반영 월이 아닌 계산서만 있으면 빈 배열', () => {
    const other = {
      id: 'x1', invoice_type: 'cost', product_id: AL30, delivery_year_month: '2026-09',
      from_company: '(주)한국에이원', to_company: '화림', invoice_basis_date: '2026-09-30',
      supply_amount: 1, vat_amount: 0, total_amount: 1,
    }
    expect(depImpactsFor(dep2605, [other], [dep2605])).toEqual([])
  })
})


// ── 배지 요약 문구 (표 한 줄에 들어가야 한다) ───────────────
describe('depBadgeFor short', () => {
  const buntan: MonthlyDepreciation = {
    ...dep2605, id: 'd9', product_id: 'p-buntan', year_month: '2026-08',
    amount: 212_078, sales_deduct_ym: null, cost_deduct_ym: '2026-08',
  }
  it('보관형 매입 — 한 줄 요약, 전체 설명은 text에 남는다', () => {
    const b = depBadgeFor({
      invoice_type: 'cost', product_id: 'p-buntan', delivery_year_month: '2026-08',
      from_company: '(주)한국에이원', to_company: '동창',
    }, [buntan])!
    expect(b.short).toBe('감가 −212,078원 (보관)')
    expect(b.text).toContain('보관 — 반환 예정')
    expect(b.short.length).toBeLessThan(b.text.length)
  })

  it('통과형 매출·매입 요약', () => {
    const sales = depBadgeFor({
      invoice_type: 'sales', product_id: AL30, delivery_year_month: '2026-05',
      from_company: '현대제철', to_company: '(주)한국에이원',
    }, [dep2605])!
    expect(sales.short).toBe('감가 −56,179원 반영 발행')
    const cost = depBadgeFor({
      invoice_type: 'cost', product_id: AL30, delivery_year_month: '2026-07',
      from_company: '(주)한국에이원', to_company: '화림',
    }, [dep2605])!
    expect(cost.short).toBe('감가 −56,179원 회수')
  })
})


// ── 계산서 회수 없는 통과형 (계약 종료 후 현금 정산) ────────
describe('별도 정산 감가 (cost_deduct_ym = null)', () => {
  it('no_cost_deduct — 매입 차감월을 null로 파싱', () => {
    const r = parseMonthlyDepInput({
      year_month: '2026-08', amount: 212_078,
      sales_deduct_ym: '2026-08', no_cost_deduct: true,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.sales_deduct_ym).toBe('2026-08')
    expect(r.cost_deduct_ym).toBeNull()
  })

  it('매출 감액도 매입 차감도 없으면 거부 — 계산서에 반영되지 않는 유령 행', () => {
    const r = parseMonthlyDepInput({ year_month: '2026-08', amount: 1, no_cost_deduct: true })
    expect(r.ok).toBe(false)
  })

  it('no_cost_deduct 미지정이면 종전대로 당월 차감', () => {
    const r = parseMonthlyDepInput({ year_month: '2026-08', amount: 1 })
    expect(r.ok && r.cost_deduct_ym).toBe('2026-08')
  })

  it('depSettlement — hold / recover / manual 구분', () => {
    expect(depSettlement({ sales_deduct_ym: null, cost_deduct_ym: '2026-08' })).toBe('hold')
    expect(depSettlement({ sales_deduct_ym: '2026-05', cost_deduct_ym: '2026-07' })).toBe('recover')
    expect(depSettlement({ sales_deduct_ym: '2026-08', cost_deduct_ym: null })).toBe('manual')
  })

  it('매입 계산서에는 배지가 붙지 않는다 — 차감할 달이 없다', () => {
    const manual: MonthlyDepreciation = {
      ...dep2605, id: 'dm', product_id: 'soggae', year_month: '2026-08',
      amount: 212_078, sales_deduct_ym: '2026-08', cost_deduct_ym: null,
    }
    const cost = depBadgeFor({
      invoice_type: 'cost', product_id: 'soggae', delivery_year_month: '2026-08',
      from_company: '(주)한국에이원', to_company: '렘코',
    }, [manual])
    expect(cost).toBeNull()
    const sales = depBadgeFor({
      invoice_type: 'sales', product_id: 'soggae', delivery_year_month: '2026-08',
      from_company: '동국제강', to_company: '(주)한국에이원',
    }, [manual])!
    expect(sales.short).toBe('감가 −212,078원 반영 발행')
  })

  it('미회수 누계에 계속 잡힌다 (정산완료 전까지)', () => {
    const manual: MonthlyDepreciation = {
      ...dep2605, id: 'dm', product_id: 'soggae', year_month: '2026-08',
      amount: 212_078, sales_deduct_ym: '2026-08', cost_deduct_ym: null,
    }
    expect(sumUnrecovered([manual])).toBe(212_078)
    expect(sumUnrecovered([{ ...manual, settled_at: '2026-12-31T00:00:00Z' }])).toBe(0)
  })
})
