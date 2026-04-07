#!/usr/bin/env node
/**
 * 2023년 이후 新형식 집계 블록 파싱 → contracts 원가단가 업데이트
 *
 * 새 형식 (2023+):
 *   [G] "총 납품 물량" 행 → 집계 블록 헤더
 *   [H] "한국에이원" 행 → [J]배분물량, [K]배분단가
 *   [H] "호진"       행 → [J]배분물량, [K]배분단가
 *   [G] "합계"       행 → 블록 끝
 *
 * 단가 단위 자동 판별:
 *   K < 1000  → 원/kg → ×1000 = 원/톤
 *   K ≥ 1000  → 원/톤 (그대로)
 *
 * 사용법:
 *   npx tsx scripts/update-costs-2023.ts --dry-run
 *   npx tsx scripts/update-costs-2023.ts
 */

import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
const EXCEL_FILE = '260101_동국제강_판매일보.xlsx'
const EXCEL_PATH = path.resolve(process.cwd(), EXCEL_FILE)

const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'string' ? parseFloat(String(v).replace(/,/g, '').trim()) : Number(v)
  return isNaN(n) ? null : n
}

const PRODUCT_NAME_MAP: Record<string, string> = {
  'AL-65B': 'AL65B', 'AL-65b': 'AL65B', 'AL65B': 'AL65B', 'AL65b': 'AL65B',
  'AL-35B': 'AL35B', 'AL-35b': 'AL35B', 'AL35B': 'AL35B', 'AL35b': 'AL35B',
  'AL-35':  'AL35B',   // 2025-06 품목명 변형
  '소괴탄': 'SOGGAE', 'SOGGAE': 'SOGGAE',
}

function normalizeProduct(raw: unknown): string | null {
  if (!raw) return null
  return PRODUCT_NAME_MAP[String(raw).trim()] ?? null
}

/** 원/kg인지 원/톤인지 자동 판별 후 원/톤으로 반환 */
function toPricePerTon(raw: number): number {
  return raw < 1000 ? Math.round(raw * 1000) : Math.round(raw)
}

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) { console.error('❌ .env.local 없음'); process.exit(1) }
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    if (key) process.env[key] = val
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────
interface CostBlock {
  yearMonth:          string   // YYYY-MM
  productName:        string   // AL35B 등
  totalQtyKg:         number   // 합계 행의 배분물량
  aewonQtyKg:         number   // 한국에이원 배분물량
  aewonPricePerTon:   number   // 한국에이원 배분단가 (원/톤)
  hoejinQtyKg:        number   // 호진 배분물량
  hoejinPricePerTon:  number   // 호진 배분단가 (원/톤)
}

// ─────────────────────────────────────────────────────────────────────────────
// 집계 블록 파싱
// ─────────────────────────────────────────────────────────────────────────────
function parseNewFormatBlocks(ws: XLSX.WorkSheet, label: string): CostBlock[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
  const blocks: CostBlock[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const gVal = String(row[6] ?? '').trim()

    if (gVal !== '총 납품 물량') continue

    const year = toNum(row[0])
    if (!year || year < 2023) continue   // 2023 이전은 구형식이므로 스킵

    const monthDay    = String(row[1] ?? '').trim()
    const productName = normalizeProduct(row[3])
    if (!productName) continue

    const mdMatch = monthDay.match(/^(\d{1,2})-\d{1,2}$/)
    if (!mdMatch) continue
    const fullYear  = year < 100 ? 2000 + year : year
    const yearMonth = `${fullYear}-${mdMatch[1].padStart(2, '0')}`

    let totalQtyKg = 0
    let aewonQtyKg = 0, aewonPricePerTon = 0
    let hoejinQtyKg = 0, hoejinPricePerTon = 0

    // 헤더 행의 I 컬럼으로 형식 구별
    //   "배분율"   → 기존/최신 형식: J=배분물량, K=배분단가
    //   "배분 단가" → 중간 형식(2025-01~06): G=총납품물량, I=단가(원/kg), 호진 없음
    const headerI   = String(row[8] ?? '').trim()
    const hasRatio  = headerI === '배분율'
    const hasDirect = headerI === '배분 단가'
    if (!hasRatio && !hasDirect) continue   // 알 수 없는 헤더 형식 스킵

    // 헤더 다음 행들에서 에이원/호진/합계 행 수집 (최대 8행)
    for (let j = i + 1; j < Math.min(i + 9, rows.length); j++) {
      const sub  = rows[j]
      const subG = String(sub[6] ?? '').trim()
      const subH = String(sub[7] ?? '').trim()

      if (subG === '합계') {
        const q = toNum(sub[9])   // 기존 형식: J=합계물량
        if (q) totalQtyKg = q
        break
      }

      if (subH === '한국에이원') {
        if (hasRatio) {
          // 기존/최신 형식: J=배분물량, K=배분단가
          const rawQty   = toNum(sub[9])
          const rawPrice = toNum(sub[10])
          if (rawQty && rawPrice) {
            aewonQtyKg       = rawQty
            aewonPricePerTon = toPricePerTon(rawPrice)
          }
        } else {
          // 중간 형식: G=총납품물량(에이원 전량), I=단가(원/kg)
          const rawQty   = toNum(sub[6])   // G = 총납품물량
          const rawPrice = toNum(sub[8])   // I = 단가(원/kg)
          if (rawQty && rawPrice) {
            aewonQtyKg       = rawQty
            totalQtyKg       = rawQty   // 에이원 전량
            aewonPricePerTon = Math.round(rawPrice * 1000)  // 원/kg → 원/톤
          }
        }
      } else if (subH === '호진' && hasRatio) {
        // 호진은 기존/최신 형식에만 존재
        const rawQty   = toNum(sub[9])
        const rawPrice = toNum(sub[10])
        if (rawQty && rawPrice) {
          hoejinQtyKg       = rawQty
          hoejinPricePerTon = toPricePerTon(rawPrice)
        }
      }
    }

    if (aewonQtyKg > 0 || hoejinQtyKg > 0) {
      blocks.push({ yearMonth, productName, totalQtyKg, aewonQtyKg, aewonPricePerTon, hoejinQtyKg, hoejinPricePerTon })
    }
  }

  console.log(`  ${label}: ${blocks.length}개 집계 블록 파싱`)
  return blocks
}

// ─────────────────────────────────────────────────────────────────────────────
// 집계 블록 → contracts 매핑 헬퍼
// ─────────────────────────────────────────────────────────────────────────────
/** 같은 계약에 여러 월이 속할 때 대표 단가(최빈값) 선택 */
function representativePrice(prices: number[]): number {
  if (prices.length === 0) return 0
  const freq = new Map<number, number>()
  for (const p of prices) freq.set(p, (freq.get(p) ?? 0) + 1)
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  loadEnv()

  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key        = serviceKey ?? anonKey
  if (!url || !key) { console.error('❌ Supabase 환경변수 없음'); process.exit(1) }

  if (!fs.existsSync(EXCEL_PATH)) { console.error(`❌ 파일 없음: ${EXCEL_PATH}`); process.exit(1) }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const wb = XLSX.readFile(EXCEL_PATH)

  console.log(`\n📂 ${EXCEL_FILE}`)
  console.log(`🔧 모드: ${DRY_RUN ? 'DRY-RUN' : '실제 UPDATE'}\n`)

  // ── 1. 시트 파싱 ─────────────────────────────────────────────────────────
  console.log('[1/4] 집계 블록 파싱...')
  const aewonBlocks  = parseNewFormatBlocks(wb.Sheets['한국에이원-금화'], '한국에이원-금화')
  const hwarlimBlocks = parseNewFormatBlocks(wb.Sheets['금화-화림'],      '금화-화림')

  // ── 2. 파싱 결과 출력 ────────────────────────────────────────────────────
  console.log('\n[2/4] 한국에이원-금화 집계 결과 (에이원 배분단가 → contracts 원가단가)')
  console.log('  연월       품목    에이원물량(톤)  에이원단가(원/톤)  호진물량(톤)  호진단가(원/톤)')
  for (const b of aewonBlocks) {
    const ae = `${(b.aewonQtyKg/1000).toFixed(1).padStart(8)}톤  ${b.aewonPricePerTon.toLocaleString().padStart(12)}원/톤`
    const hj = b.hoejinQtyKg > 0
      ? `  호진: ${(b.hoejinQtyKg/1000).toFixed(1)}톤 @${b.hoejinPricePerTon.toLocaleString()}원/톤`
      : ''
    console.log(`  ${b.yearMonth}  ${b.productName.padEnd(7)} 에이원: ${ae}${hj}`)
  }

  console.log('\n[3/4] 금화-화림 집계 결과 (화림 원가단가)')
  console.log('  연월       품목    화림-에이원단가(원/톤)  호진단가(원/톤)')
  for (const b of hwarlimBlocks) {
    const ae = `${b.aewonPricePerTon.toLocaleString().padStart(12)}원/톤`
    const hj = b.hoejinQtyKg > 0
      ? `  호진: ${(b.hoejinQtyKg/1000).toFixed(1)}톤 @${b.hoejinPricePerTon.toLocaleString()}원/톤`
      : ''
    console.log(`  ${b.yearMonth}  ${b.productName.padEnd(7)} ${ae}${hj}`)
  }

  // ── 3. contracts.cost_price 업데이트 ─────────────────────────────────────
  console.log('\n[4/4] contracts.cost_price 업데이트 (한국에이원-금화 에이원 배분단가 기준)...')

  // 기존 contracts 로드
  const { data: contracts, error: cErr } = await supabase
    .from('contracts')
    .select('id, product_id, start_date, end_date, sell_price, cost_price, cost_price_2')

  if (cErr) { console.error('❌ contracts 조회 실패:', cErr.message); process.exit(1) }

  // 품목 ID 맵 로드
  const { data: products } = await supabase.from('products').select('id, name')
  const productIdMap = new Map<string, string>()
  for (const p of products ?? []) productIdMap.set(p.name, p.id)

  // yearMonth:productName → 에이원 배분단가 맵
  const aewonPriceMap = new Map<string, number>()
  for (const b of aewonBlocks) {
    aewonPriceMap.set(`${b.yearMonth}:${b.productName}`, b.aewonPricePerTon)
  }

  // 금화-화림 yearMonth:productName → 화림 배분단가 맵
  const hwarlimPriceMap = new Map<string, number>()
  for (const b of hwarlimBlocks) {
    hwarlimPriceMap.set(`${b.yearMonth}:${b.productName}`, b.aewonPricePerTon)
  }

  // 각 contract에 대해 해당 기간의 에이원 배분단가 수집 → 대표 단가 계산
  let updated = 0, skipped = 0, errors = 0

  for (const c of contracts ?? []) {
    const productName = [...productIdMap.entries()]
      .find(([, id]) => id === c.product_id)?.[0]
    if (!productName) continue

    // 이 계약 기간에 해당하는 집계 블록 찾기
    const start = new Date(c.start_date)
    const end   = new Date(c.end_date)

    const aewonPrices: number[]   = []
    const hwarlimPrices: number[] = []

    // 시작~끝 월 순회
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur <= end) {
      const ym  = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
      const key = `${ym}:${productName}`
      const ap  = aewonPriceMap.get(key)
      const hp  = hwarlimPriceMap.get(key)
      if (ap) aewonPrices.push(ap)
      if (hp) hwarlimPrices.push(hp)
      cur.setMonth(cur.getMonth() + 1)
    }

    if (aewonPrices.length === 0) {
      // 2023 이전 계약이거나 해당 기간 데이터 없음
      continue
    }

    const newCostPrice    = representativePrice(aewonPrices)
    const hwarlimCostPrice = hwarlimPrices.length > 0 ? representativePrice(hwarlimPrices) : null

    const startStr = c.start_date.slice(0, 10)
    const endStr   = c.end_date.slice(0, 10)
    const label    = `${productName} (${startStr}~${endStr}) 판매${c.sell_price}원/톤`

    if (DRY_RUN) {
      console.log(`  [DRY] UPDATE ${label}`)
      console.log(`         cost_price:   ${c.cost_price} → ${newCostPrice.toLocaleString()}원/톤 (에이원)`)
      if (hwarlimCostPrice) {
        console.log(`         cost_price_2: ${c.cost_price_2 ?? 'null'} → ${hwarlimCostPrice.toLocaleString()}원/톤 (화림)`)
      }
      updated++
      continue
    }

    const updatePayload: Record<string, number> = { cost_price: newCostPrice }
    if (hwarlimCostPrice) updatePayload.cost_price_2 = hwarlimCostPrice

    const { error: upErr } = await supabase
      .from('contracts')
      .update(updatePayload)
      .eq('id', c.id)

    if (upErr) {
      console.error(`  ❌ UPDATE 실패 (${label}): ${upErr.message}`)
      errors++
    } else {
      console.log(`  ✅ UPDATE ${label}`)
      console.log(`         cost_price: ${c.cost_price} → ${newCostPrice.toLocaleString()}  cost_price_2: ${c.cost_price_2 ?? 'null'} → ${hwarlimCostPrice?.toLocaleString() ?? '-'}`)
      updated++
    }
  }

  // ── 4. deliveries 호진 배분 업데이트 ─────────────────────────────────────
  console.log('\n[5/5] deliveries 호진 배분 업데이트 (각 월 첫 번째 건에 월 전체 호진물량 저장)...')

  // yearMonth:productName → 호진 블록 맵 (한국에이원-금화 기준)
  const hoejinBlockMap = new Map<string, { qtyKg: number; pricePerTon: number }>()
  for (const b of aewonBlocks) {
    if (b.hoejinQtyKg > 0) {
      hoejinBlockMap.set(`${b.yearMonth}:${b.productName}`, {
        qtyKg:       b.hoejinQtyKg,
        pricePerTon: b.hoejinPricePerTon,
      })
    }
  }

  // deliveries 로드 (product_id + year_month + delivery_date 기준)
  const { data: deliveries, error: dErr } = await supabase
    .from('deliveries')
    .select('id, year_month, product_id, delivery_date, addl_quantity_kg, addl_margin_per_ton')
    .order('delivery_date', { ascending: true })

  if (dErr) { console.error('❌ deliveries 조회 실패:', dErr.message); process.exit(1) }

  // 월별 첫 번째 delivery 식별 (year_month:product_id → 첫 번째 delivery id)
  const firstDeliveryMap = new Map<string, { id: string; date: string }>()
  for (const d of deliveries ?? []) {
    const key = `${d.year_month}:${d.product_id}`
    const cur = firstDeliveryMap.get(key)
    if (!cur || d.delivery_date < cur.date) {
      firstDeliveryMap.set(key, { id: d.id, date: d.delivery_date })
    }
  }

  let dUpdated = 0, dErrors = 0

  for (const [ymProduct, hoejin] of hoejinBlockMap) {
    const [ym, productName] = ymProduct.split(':')
    const productId = productIdMap.get(productName)
    if (!productId) continue

    const firstKey = `${ym}:${productId}`
    const first    = firstDeliveryMap.get(firstKey)
    if (!first) {
      console.log(`  ⚠ 해당 월 delivery 없음: ${ym} ${productName} → 스킵`)
      continue
    }

    if (DRY_RUN) {
      console.log(`  [DRY] UPDATE delivery ${ym} ${productName} (${first.date}): addl_quantity_kg=${hoejin.qtyKg.toFixed(0)}kg, addl_margin_per_ton=${hoejin.pricePerTon.toLocaleString()}원/톤`)
      dUpdated++
      continue
    }

    const { error: dUpErr } = await supabase
      .from('deliveries')
      .update({
        addl_quantity_kg:    hoejin.qtyKg,
        addl_margin_per_ton: hoejin.pricePerTon,
      })
      .eq('id', first.id)

    if (dUpErr) {
      console.error(`  ❌ delivery 업데이트 실패 (${ym} ${productName}): ${dUpErr.message}`)
      dErrors++
    } else {
      console.log(`  ✅ delivery 업데이트 ${ym} ${productName} (${first.date}): 호진 ${(hoejin.qtyKg/1000).toFixed(1)}톤 @${hoejin.pricePerTon.toLocaleString()}원/톤`)
      dUpdated++
    }
  }

  console.log('\n══════════════════════════════════════════════════')
  console.log('📊 결과 요약')
  console.log(`  contracts 업데이트: ${updated}건`)
  if (errors > 0) console.log(`    ❌ 오류: ${errors}건`)
  console.log(`  deliveries 호진 배분 업데이트: ${dUpdated}건`)
  if (dErrors > 0) console.log(`    ❌ 오류: ${dErrors}건`)

  if (DRY_RUN) console.log('\n✅ DRY-RUN 완료. 실제 업데이트는 --dry-run 없이 실행하세요.')
  else         console.log('\n✅ 업데이트 완료.')
}

main().catch(e => { console.error(e); process.exit(1) })
