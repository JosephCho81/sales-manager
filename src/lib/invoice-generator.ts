/**
 * 계산서 발행 지시 자동 생성 로직
 * 품목별 거래 구조에 따라 발행 지시 목록을 생성한다.
 */
import { calcMarginFromContract, calcAddlMargin, splitMargin } from './margin'

// ────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────
export type InvoiceType = 'sales' | 'cost' | 'commission' | 'other'

export interface DeliveryForInvoice {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  product_name: string        // e.g. 'AL35B'
  product_vat: string         // 'TEN_PERCENT' | 'NONE'
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  /** 호진 부족분 물량 (kg) — AL35B 전용 */
  hoejin_shortage_kg: number | null
  /** 호진 부족분 단가 (원/톤, 화림 통보) — AL35B 전용 */
  hoejin_shortage_price: number | null
  /** FeSi BL 날짜 기준 실제 환율 (원/USD). 있으면 reference_exchange_rate보다 우선 */
  fx_rate: number | null
  contract: {
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  }
}

export interface InvoiceToCreate {
  year_month: string
  product_id: string
  delivery_ids: string[]
  from_company: string
  to_company: string
  supply_amount: number
  vat_amount: number
  total_amount: number
  invoice_basis_date: string
  issue_deadline: string
  payment_due_date: string
  is_paid: boolean
  invoice_type: InvoiceType
  memo: string
}

// ────────────────────────────────────────────────────────
// 날짜 유틸
// ────────────────────────────────────────────────────────
function parseYM(ym: string): [number, number] {
  const [y, m] = ym.split('-').map(Number)
  return [y, m]
}

/** YYYY-MM에 n개월 더하기 */
function shiftMonths(ym: string, n: number): string {
  const [y, m] = parseYM(ym)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** YYYY-MM의 마지막 날 */
function monthEnd(ym: string): string {
  const [y, m] = parseYM(ym)
  return new Date(y, m, 0).toISOString().slice(0, 10)
}

/** YYYY-MM의 N일 */
function nthDay(ym: string, day: number): string {
  return `${ym}-${String(day).padStart(2, '0')}`
}

/** 날짜 문자열에 N일 더하기 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ────────────────────────────────────────────────────────
// 인보이스 항목 생성 헬퍼
// ────────────────────────────────────────────────────────
function makeInvoice(p: {
  yearMonth: string
  productId: string
  deliveryIds: string[]
  from: string
  to: string
  supply: number
  vat: boolean
  basisDate: string
  deadline: string
  paymentDue: string
  type: InvoiceType
  memo: string
}): InvoiceToCreate {
  const supply = Math.round(p.supply)
  const vatAmt = p.vat ? Math.round(supply * 0.1) : 0
  return {
    year_month: p.yearMonth,
    product_id: p.productId,
    delivery_ids: p.deliveryIds,
    from_company: p.from,
    to_company: p.to,
    supply_amount: supply,
    vat_amount: vatAmt,
    total_amount: supply + vatAmt,
    invoice_basis_date: p.basisDate,
    issue_deadline: p.deadline,
    payment_due_date: p.paymentDue,
    is_paid: false,
    invoice_type: p.type,
    memo: p.memo,
  }
}

/** 공통: 마진 합산 (기본 + 추가 배분) — AL30, 소괴탄, 분탄용 */
function calcCombinedMargin(deliveries: DeliveryForInvoice[]) {
  let totalMargin = 0
  for (const d of deliveries) {
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    totalMargin += m.total_margin
    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      totalMargin += am.total_margin
    }
  }
  return { totalMargin, ...splitMargin(totalMargin) }
}

/** AL35B 전용: 기본 마진 / 호진 추가(addl) / 호진 부족분 분리 계산 */
function separateALMargins(deliveries: DeliveryForInvoice[]) {
  let mainTotal = 0, addlTotal = 0, shortageTotal = 0
  for (const d of deliveries) {
    const m = calcMarginFromContract(d.contract, d.quantity_kg)
    mainTotal += m.total_margin
    if (d.addl_quantity_kg && d.addl_margin_per_ton) {
      const am = calcAddlMargin(d.addl_quantity_kg, d.addl_margin_per_ton)
      addlTotal += am.total_margin
    }
    if (d.hoejin_shortage_kg && d.hoejin_shortage_price) {
      shortageTotal += (d.hoejin_shortage_kg / 1000) * d.hoejin_shortage_price
    }
  }
  return {
    main:     { total: mainTotal,  ...splitMargin(mainTotal) },
    addl:     { total: addlTotal,  ...splitMargin(addlTotal) },
    shortage: shortageTotal,
  }
}

// ────────────────────────────────────────────────────────
// 품목별 발행 지시 생성 함수
// ────────────────────────────────────────────────────────

/** AL-35B / AL-65B (동국제강 ← 화림) */
function genALSeries(
  deliveries: DeliveryForInvoice[],
  ym: string
): InvoiceToCreate[] {
  const pid    = deliveries[0].product_id
  const ids    = deliveries.map(d => d.id)
  const hasVat = deliveries[0].product_vat === 'TEN_PERCENT'
  const nextM  = shiftMonths(ym, 1)
  const next2M = shiftMonths(ym, 2)
  const ymLabel = ym.replace('-', '년 ') + '월'

  const sellTotal = deliveries.reduce((s, d) => s + d.contract.sell_price * d.quantity_kg / 1000, 0)
  const costTotal = deliveries.reduce((s, d) => {
    const cost = d.contract.currency === 'USD' && d.contract.reference_exchange_rate
      ? d.contract.cost_price * d.contract.reference_exchange_rate
      : d.contract.cost_price
    return s + cost * d.quantity_kg / 1000
  }, 0)

  // 기본 마진 / 호진 추가 / 호진 부족분 분리
  const { main, addl, shortage } = separateALMargins(deliveries)

  const result: InvoiceToCreate[] = [
    // 1. 동국제강→한국에이원 역발행 (매출)
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '한국에이원', supply: sellTotal, vat: hasVat,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: monthEnd(nextM),
      type: 'sales', memo: '동국제강 역발행 — 매출',
    }),
    // 2. 화림→금화 (원가)
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '화림', to: '금화', supply: costTotal, vat: hasVat,
      basisDate: monthEnd(ym), deadline: monthEnd(ym), paymentDue: nthDay(next2M, 1),
      type: 'cost', memo: '화림 원가 — 당월말 기준 (익익월1일 대금)',
    }),
    // 3. 금화→한국에이원 (원가 중간)
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '금화', to: '한국에이원', supply: costTotal, vat: hasVat,
      basisDate: monthEnd(nextM), deadline: nthDay(next2M, 1), paymentDue: nthDay(next2M, 1),
      type: 'cost', memo: '금화→한국에이원 원가 — 익월말 기준',
    }),
    // 4. 한국에이원→금화 커미션 (기본 마진만)
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '금화', supply: main.geumhwa, vat: hasVat,
      basisDate: nthDay(next2M, 1), deadline: nthDay(next2M, 1), paymentDue: nthDay(next2M, 1),
      type: 'commission', memo: `${ymLabel} 마진 — 금화 커미션 1/3`,
    }),
    // 5. 한국에이원→라성 커미션 (기본 마진만)
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '라성', supply: main.raseong, vat: hasVat,
      basisDate: nthDay(next2M, 1), deadline: nthDay(next2M, 10), paymentDue: nthDay(next2M, 10),
      type: 'commission', memo: `${ymLabel} 마진 — 라성 커미션 (나머지)`,
    }),
  ]

  // ── 호진 더 가져갈 때: 화림→한국에이원 + 배분 ─────────────────
  if (addl.total > 0) {
    result.push(
      makeInvoice({
        yearMonth: ym, productId: pid, deliveryIds: ids,
        from: '화림', to: '한국에이원', supply: addl.total, vat: hasVat,
        basisDate: monthEnd(ym), deadline: monthEnd(ym), paymentDue: nthDay(nextM, 10),
        type: 'commission',
        memo: `${ymLabel} 호진 추가 배분 커미션 (화림→한국에이원)`,
      }),
      makeInvoice({
        yearMonth: ym, productId: pid, deliveryIds: ids,
        from: '한국에이원', to: '금화', supply: addl.geumhwa, vat: hasVat,
        basisDate: nthDay(nextM, 1), deadline: nthDay(nextM, 10), paymentDue: nthDay(nextM, 10),
        type: 'commission',
        memo: `${ymLabel} 호진 추가 배분 — 금화 1/3`,
      }),
      makeInvoice({
        yearMonth: ym, productId: pid, deliveryIds: ids,
        from: '한국에이원', to: '라성', supply: addl.raseong, vat: hasVat,
        basisDate: nthDay(nextM, 1), deadline: nthDay(nextM, 10), paymentDue: nthDay(nextM, 10),
        type: 'commission',
        memo: `${ymLabel} 호진 추가 배분 — 라성 (나머지)`,
      }),
    )
  }

  // ── 호진 덜 가져갈 때: 한국에이원→호진 부족분 지급 ──────────────
  if (shortage > 0) {
    result.push(
      makeInvoice({
        yearMonth: ym, productId: pid, deliveryIds: ids,
        from: '한국에이원', to: '호진', supply: shortage, vat: hasVat,
        basisDate: monthEnd(ym), deadline: nthDay(nextM, 10), paymentDue: nthDay(nextM, 10),
        type: 'other',
        memo: `${ymLabel} 호진 부족분 지급 (화림 통보 단가)`,
      }),
    )
  }

  return result
}

/** 소괴탄 (동국제강 ← 렘코, VAT 없음) */
function genSoggae(
  deliveries: DeliveryForInvoice[],
  ym: string
): InvoiceToCreate[] {
  const pid = deliveries[0].product_id
  const ids = deliveries.map(d => d.id)
  const nextM = shiftMonths(ym, 1)

  const sellTotal = deliveries.reduce((s, d) => s + d.contract.sell_price * d.quantity_kg / 1000, 0)
  const costTotal = deliveries.reduce((s, d) => s + d.contract.cost_price * d.quantity_kg / 1000, 0)
  const { geumhwa, raseong } = calcCombinedMargin(deliveries)

  return [
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '한국에이원', supply: sellTotal, vat: false,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'sales', memo: '동국제강 역발행 — 매출 (VAT없음)',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '렘코', supply: costTotal, vat: false,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'cost', memo: '렘코 원가 (VAT없음)',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '금화', supply: geumhwa, vat: false,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 15), paymentDue: nthDay(nextM, 15),
      type: 'commission', memo: '금화 커미션 1/3',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '라성', supply: raseong, vat: false,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 15), paymentDue: nthDay(nextM, 15),
      type: 'commission', memo: '라성 커미션 (나머지)',
    }),
  ]
}

/** 분탄 (동국→렘코→한국에이원→동창, VAT 10%) */
function genBuntan(
  deliveries: DeliveryForInvoice[],
  ym: string
): InvoiceToCreate[] {
  const pid = deliveries[0].product_id
  const ids = deliveries.map(d => d.id)
  const nextM = shiftMonths(ym, 1)

  const sellTotal = deliveries.reduce((s, d) => s + d.contract.sell_price * d.quantity_kg / 1000, 0)
  const costTotal = deliveries.reduce((s, d) => s + d.contract.cost_price * d.quantity_kg / 1000, 0)
  const { geumhwa, raseong } = calcCombinedMargin(deliveries)

  return [
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '렘코', supply: sellTotal, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'sales', memo: '동국→렘코 — 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '렘코', to: '한국에이원', supply: sellTotal, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'cost', memo: '렘코→한국에이원 — 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '동창', supply: costTotal, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 1), paymentDue: nthDay(nextM, 10),
      type: 'cost', memo: '한국에이원→동창 — 익월1일 동시 발행',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '금화', supply: geumhwa, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 15), paymentDue: nthDay(nextM, 15),
      type: 'commission', memo: '금화 커미션 1/3',
    }),
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '라성', supply: raseong, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(nextM, 15), paymentDue: nthDay(nextM, 15),
      type: 'commission', memo: '라성 커미션 (나머지)',
    }),
  ]
}

/** 페로실리콘 — 입고 건별 생성 (BL 날짜 기준) */
function genFeSi(
  delivery: DeliveryForInvoice,
  ym: string
): InvoiceToCreate[] {
  const pid = delivery.product_id
  const ids = [delivery.id]
  const refDate = delivery.delivery_date ?? nthDay(ym, 15) // BL 날짜 or 추정
  const pay10  = addDays(refDate, 10)   // 동국→한국에이원 입고 후 10일
  const pay15  = addDays(refDate, 15)   // 한국에이원→EG 입고 후 15일

  // BL 날짜 기준 실제 환율 우선, 없으면 계약 참고 환율 사용
  const rate = delivery.fx_rate ?? delivery.contract.reference_exchange_rate ?? 1
  const sellUsdTotal = delivery.contract.sell_price * delivery.quantity_kg / 1000   // USD
  const sellTotal = sellUsdTotal * rate                                              // KRW
  const costUsdTotal = delivery.contract.cost_price * delivery.quantity_kg / 1000   // USD
  const costKrwTotal = costUsdTotal * rate

  const { geumhwa, raseong } = calcCombinedMargin([delivery])

  return [
    // 동국→한국에이원 역발행 (원화)
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '동국제강', to: '한국에이원', supply: sellTotal, vat: true,
      basisDate: refDate, deadline: refDate, paymentDue: pay10,
      type: 'sales',
      memo: `역발행 BL ${refDate} — 입고후10일 대금`,
    }),
    // EG→한국에이원 (달러 계산서, KRW 환산 표시)
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: 'EG', to: '한국에이원', supply: costKrwTotal, vat: true,
      basisDate: refDate, deadline: refDate, paymentDue: pay15,
      type: 'cost',
      memo: `EG 달러계산서 BL ${refDate} | USD ${costUsdTotal.toFixed(2)} × ${rate}원 — 입고후15일 송금`,
    }),
    // 한국에이원→금화 커미션 (EG 지급 완료 후)
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '금화', supply: geumhwa, vat: true,
      basisDate: pay15, deadline: pay15, paymentDue: pay15,
      type: 'commission', memo: 'EG 지급 완료 후 금화 커미션 1/3',
    }),
    // 한국에이원→라성 커미션
    makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '한국에이원', to: '라성', supply: raseong, vat: true,
      basisDate: pay15, deadline: pay15, paymentDue: pay15,
      type: 'commission', memo: 'EG 지급 완료 후 라성 커미션 (나머지)',
    }),
  ]
}

/** AL-30 (현대제철 ← 화림, 60일 어음) */
function genAL30(
  deliveries: DeliveryForInvoice[],
  ym: string
): InvoiceToCreate[] {
  const pid = deliveries[0].product_id
  const next2M = shiftMonths(ym, 2)

  // 10일 단위 3구간으로 그룹
  const periods: Array<{ label: string; days: DeliveryForInvoice[]; basisDate: string }> = [
    { label: '1~10일', days: [], basisDate: nthDay(ym, 10) },
    { label: '11~20일', days: [], basisDate: nthDay(ym, 20) },
    { label: '21일~말일', days: [], basisDate: monthEnd(ym) },
  ]
  for (const d of deliveries) {
    const day = d.delivery_date ? parseInt(d.delivery_date.slice(8, 10)) : 15
    if (day <= 10) periods[0].days.push(d)
    else if (day <= 20) periods[1].days.push(d)
    else periods[2].days.push(d)
  }

  const result: InvoiceToCreate[] = []
  const costsPerPeriod: number[] = []
  let totalGeumhwa = 0
  let totalRaseong = 0

  for (const period of periods) {
    if (period.days.length === 0) continue
    const ids = period.days.map(d => d.id)
    const sellTotal = period.days.reduce((s, d) => s + d.contract.sell_price * d.quantity_kg / 1000, 0)
    const costTotal = period.days.reduce((s, d) => s + d.contract.cost_price * d.quantity_kg / 1000, 0)
    const billDue = addDays(period.basisDate, 60)
    const { geumhwa, raseong } = calcCombinedMargin(period.days)

    totalGeumhwa += geumhwa
    totalRaseong += raseong
    costsPerPeriod.push(costTotal)

    // 현대→한국에이원 역발행 (10일 단위, 60일 어음)
    result.push(makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: ids,
      from: '현대제철', to: '한국에이원', supply: sellTotal, vat: true,
      basisDate: period.basisDate, deadline: period.basisDate,
      paymentDue: billDue,  // 60일 어음 만기
      type: 'sales',
      memo: `현대제철 역발행 ${period.label} — 60일 어음 만기 ${billDue}`,
    }))
  }

  // 화림→한국에이원: 당월 합산 1장, 익익월1일 지급
  const totalCost = costsPerPeriod.reduce((a, b) => a + b, 0)
  if (totalCost > 0) {
    result.push(makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: deliveries.map(d => d.id),
      from: '한국에이원', to: '화림', supply: totalCost, vat: true,
      basisDate: monthEnd(ym), deadline: nthDay(next2M, 1), paymentDue: nthDay(next2M, 1),
      type: 'cost',
      memo: '한국에이원→화림 당월 합산 1장 — 익익월1일 지급',
    }))
  }

  // 커미션 — 익익월10일
  if (totalGeumhwa > 0) {
    result.push(makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: deliveries.map(d => d.id),
      from: '한국에이원', to: '금화', supply: totalGeumhwa, vat: true,
      basisDate: nthDay(next2M, 1), deadline: nthDay(next2M, 10), paymentDue: nthDay(next2M, 10),
      type: 'commission', memo: '금화 커미션 1/3 — 익익월10일',
    }))
    result.push(makeInvoice({
      yearMonth: ym, productId: pid, deliveryIds: deliveries.map(d => d.id),
      from: '한국에이원', to: '라성', supply: totalRaseong, vat: true,
      basisDate: nthDay(next2M, 1), deadline: nthDay(next2M, 10), paymentDue: nthDay(next2M, 10),
      type: 'commission', memo: '라성 커미션 (나머지) — 익익월10일',
    }))
  }

  return result
}

// ────────────────────────────────────────────────────────
// 메인 생성 함수
// ────────────────────────────────────────────────────────
/**
 * @param fxRates  FeSi용 BL 날짜 실제 환율 맵.
 *                 key = `${product_id}:${delivery_date}` (YYYY-MM-DD), value = 원/USD
 */
export function generateInvoices(
  deliveries: DeliveryForInvoice[],
  yearMonth: string,
  fxRates?: Map<string, number>
): InvoiceToCreate[] {
  if (deliveries.length === 0) return []

  const result: InvoiceToCreate[] = []

  // 품목별 그룹화
  const byProduct = new Map<string, DeliveryForInvoice[]>()
  for (const d of deliveries) {
    const list = byProduct.get(d.product_name) ?? []
    list.push(d)
    byProduct.set(d.product_name, list)
  }

  for (const [productName, group] of byProduct) {
    const name = productName.toUpperCase()

    if (name === 'AL35B' || name === 'AL65B') {
      result.push(...genALSeries(group, yearMonth))
    } else if (name === 'SOGGAE') {
      result.push(...genSoggae(group, yearMonth))
    } else if (name === 'BUNTAN') {
      result.push(...genBuntan(group, yearMonth))
    } else if (name === 'FESI75' || name === 'FESI60') {
      // FeSi는 건별 생성, BL 날짜 기준 환율 적용
      for (const d of group) {
        const fxKey = `${d.product_id}:${d.delivery_date ?? ''}`
        const actualRate = fxRates?.get(fxKey) ?? null
        result.push(...genFeSi({ ...d, fx_rate: actualRate }, yearMonth))
      }
    } else if (name === 'AL30') {
      result.push(...genAL30(group, yearMonth))
    }
    // 기타 품목은 추후 추가
  }

  return result
}
