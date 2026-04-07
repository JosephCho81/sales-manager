#!/usr/bin/env node
/**
 * 엑셀 → Supabase DB 이전 스크립트
 *
 * 사용법:
 *   npx tsx scripts/import-excel.ts --inspect          # 시트 구조 확인
 *   npx tsx scripts/import-excel.ts --dry-run          # 파싱만, DB insert 없음
 *   npx tsx scripts/import-excel.ts                    # 실제 import
 *   npx tsx scripts/import-excel.ts --file other.xlsx  # 파일명 지정
 *
 * 엑셀 구조 (260101_동국제강_판매일보.xlsx):
 *   Sheet "동국-한국에이원": 헤더=3행, 데이터=4행~, 단위=원/kg, 물량=kg
 *     [A]년도  [B]월일(MM-DD)  [D]품명  [F]수량(kg)  [G]단가(원/kg)
 *   Sheet "금화-화림": 헤더 없음, 동일 열 구조
 *     [A]년도  [B]월일(MM-DD)  [D]품명  [F]수량(kg)  [G]단가(원/kg) ← 원가
 */

import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  excelFile: '260101_동국제강_판매일보.xlsx',

  sheets: {
    sell: '동국-한국에이원',  // 판매단가 소스
    cost: '금화-화림',        // 원가단가 소스
  },

  // 열 인덱스 (0-based): inspect 결과 기준
  colIdx: {
    year:      0,  // [A] 년도
    monthDay:  1,  // [B] 월일 (MM-DD)
    product:   3,  // [D] 품명
    unit:      4,  // [E] 단위 (kg)
    quantity:  5,  // [F] 수량 (kg)
    unitPrice: 6,  // [G] 단가 (원/kg)
  },

  // 데이터 시작 행 인덱스 (0-based). 헤더=2(행3), 데이터=3(행4)
  dataStartIndex: 3,

  // 품목명 정규화
  productNameMap: {
    'AL-65B': 'AL65B', 'AL-65b': 'AL65B', 'AL65B': 'AL65B', 'AL65b': 'AL65B',
    'AL-35B': 'AL35B', 'AL-35b': 'AL35B', 'AL35B': 'AL35B', 'AL35b': 'AL35B',
    'AL-30':  'AL30',  'AL30':   'AL30',
    '소괴탄': 'SOGGAE','SOGGAE': 'SOGGAE',
    '분탄':   'BUNTAN','BUNTAN': 'BUNTAN',
    'FeSi75': 'FESI75','FESI75': 'FESI75',
    'FeSi60': 'FESI60','FESI60': 'FESI60',
  } as Record<string, string>,

  productCurrencyMap: {
    'AL35B': 'KRW', 'AL65B': 'KRW', 'SOGGAE': 'KRW',
    'BUNTAN': 'KRW', 'AL30': 'KRW', 'FESI75': 'USD', 'FESI60': 'USD',
  } as Record<string, 'KRW' | 'USD'>,

  // 품목 자동 생성 시 기본값
  productDefaults: {
    'AL35B':  { display_name: 'AL-35B',  buyer: '동국제강', price_unit: 'KRW_TON' },
    'AL65B':  { display_name: 'AL-65B',  buyer: '동국제강', price_unit: 'KRW_TON' },
    'SOGGAE': { display_name: '소괴탄',   buyer: '동국제강', price_unit: 'KRW_TON' },
    'BUNTAN': { display_name: '분탄',     buyer: '동국제강', price_unit: 'KRW_TON' },
    'AL30':   { display_name: 'AL-30',   buyer: '현대제철', price_unit: 'KRW_TON' },
    'FESI75': { display_name: 'FeSi75',  buyer: '동국제강', price_unit: 'USD_TON' },
    'FESI60': { display_name: 'FeSi60',  buyer: '동국제강', price_unit: 'USD_TON' },
  } as Record<string, { display_name: string; buyer: string; price_unit: string }>,
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const INSPECT  = args.includes('--inspect')
const DRY_RUN  = args.includes('--dry-run')
const fileArgI = args.indexOf('--file')
const fileArg  = fileArgI !== -1 ? args[fileArgI + 1] : undefined
const EXCEL_PATH = path.resolve(process.cwd(), fileArg ?? CONFIG.excelFile)

// ─────────────────────────────────────────────────────────────────────────────
// 환경변수
// ─────────────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) { console.error('❌ .env.local 없음'); process.exit(1) }
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────
function normalizeProduct(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  return CONFIG.productNameMap[s] ?? null
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '').trim()) : Number(v)
  return isNaN(n) ? null : n
}

/** [A]년도 + [B]월일(MM-DD) → YYYY-MM-DD */
function buildDate(year: unknown, monthDay: unknown): string | null {
  const y = toNum(year)
  if (!y || !monthDay) return null
  const md = String(monthDay).trim()
  // MM-DD 형식
  const match = md.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  const fullYear = y < 100 ? 2000 + y : y
  return `${fullYear}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// INSPECT
// ─────────────────────────────────────────────────────────────────────────────
function runInspect() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`❌ 파일 없음: ${EXCEL_PATH}`); process.exit(1)
  }
  const wb = XLSX.readFile(EXCEL_PATH)
  console.log(`\n📂 ${EXCEL_PATH}\n`)
  console.log('시트:', wb.SheetNames.map((n, i) => `${i+1}. "${n}"`).join(', '), '\n')

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
    console.log(`${'─'.repeat(60)}\n📄 "${sheetName}" (${rows.length}행)`)

    // 헤더 후보: 문자열 컬럼이 가장 많은 행(최초 10행 내)
    let hIdx = 0, maxStr = 0
    rows.slice(0, 10).forEach((r, i) => {
      const cnt = r.filter(c => typeof c === 'string' && c.trim()).length
      if (cnt > maxStr) { maxStr = cnt; hIdx = i }
    })
    console.log(`헤더 행 ${hIdx + 1}:`)
    rows[hIdx].forEach((c, i) => {
      if (c !== null && String(c).trim())
        console.log(`  [${XLSX.utils.encode_col(i)}] "${c}"`)
    })
    console.log('샘플 (3행):')
    rows.slice(hIdx + 1).filter(r => r.some(c => c !== null && String(c).trim()))
      .slice(0, 3).forEach((r, ri) => {
        const cells = r.map((c, ci) => c !== null && String(c).trim()
          ? `[${XLSX.utils.encode_col(ci)}]${String(c).slice(0,15)}` : null).filter(Boolean)
        console.log(`  행${hIdx + 2 + ri}: ${cells.join('  ')}`)
      })
    console.log()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 파싱
// ─────────────────────────────────────────────────────────────────────────────
interface SheetRow {
  delivery_date: string
  year_month: string
  product_name: string
  quantity_kg: number
  price_per_ton: number  // 원/톤 (원/kg × 1000)
}

/** Sheet 1 또는 Sheet 3을 동일 형식으로 파싱 */
function parseSheet(wb: XLSX.WorkBook, sheetName: string, label: string): SheetRow[] {
  const ws = wb.Sheets[sheetName]
  if (!ws) {
    console.error(`❌ 시트 없음: "${sheetName}"`); process.exit(1)
  }
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
  const rows = allRows.slice(CONFIG.dataStartIndex)

  const result: SheetRow[] = []
  let skipped = 0
  const ci = CONFIG.colIdx

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const productRaw = row[ci.product]
    const productName = normalizeProduct(productRaw)
    if (!productName) { skipped++; continue }

    const qty = toNum(row[ci.quantity])
    if (!qty || qty <= 0) { skipped++; continue }  // 빈 행 or 수량 0 or 음수(조정분) 스킵

    const price = toNum(row[ci.unitPrice])
    if (!price || price <= 0) { skipped++; continue }
    // sanity check: 원/kg 단가 상한 (2,000원/kg 초과는 합계금액 등 오류 데이터)
    if (price > 2000) { skipped++; continue }

    const dateStr = buildDate(row[ci.year], row[ci.monthDay])
    if (!dateStr) { skipped++; continue }

    result.push({
      delivery_date: dateStr,
      year_month:    dateStr.slice(0, 7),
      product_name:  productName,
      quantity_kg:   qty,                 // 이미 kg
      price_per_ton: price * 1000,        // 원/kg → 원/톤
    })
  }

  console.log(`  ${label}: ${result.length}건 파싱, ${skipped}건 스킵`)
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────────────────────────────────────
async function runImport() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = serviceKey ?? anonKey
  if (!url || !key) { console.error('❌ Supabase 환경변수 없음'); process.exit(1) }
  if (!serviceKey) console.warn('⚠ SUPABASE_SERVICE_ROLE_KEY 없음 — anon key 사용 (RLS로 INSERT 실패할 수 있음)')
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`❌ 파일 없음: ${EXCEL_PATH}`); process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const wb = XLSX.readFile(EXCEL_PATH)

  console.log(`\n📂 ${path.basename(EXCEL_PATH)}`)
  console.log(`🔧 모드: ${DRY_RUN ? 'DRY-RUN' : '실제 IMPORT'}\n`)

  // ── 1. 시트 파싱 ──────────────────────────────────────────────────────────
  console.log('[1/5] 시트 파싱...')
  const sellRows = parseSheet(wb, CONFIG.sheets.sell, '동국-한국에이원(판매)')
  const costRows = parseSheet(wb, CONFIG.sheets.cost, '금화-화림(원가)')

  // ── 2. 판매·원가 매핑 ─────────────────────────────────────────────────────
  // 우선순위:
  //   1) 정확 매핑: (날짜 + 품목 + 물량)
  //   2) 날짜+품목: 물량이 가장 가까운 것
  //   3) 연월+품목: 해당 월 대표 원가(최빈값)
  console.log('\n[2/5] 판매↔원가 매핑...')

  // 정확 매핑용
  const exactCostMap = new Map<string, number>()
  // 날짜+품목 → [(qty, price)]
  const dateProdCostMap = new Map<string, Array<{ qty: number; price: number }>>()
  // 연월+품목 → price[]
  const ymProdCostMap = new Map<string, number[]>()

  for (const r of costRows) {
    exactCostMap.set(`${r.delivery_date}:${r.product_name}:${r.quantity_kg}`, r.price_per_ton)
    const dpKey = `${r.delivery_date}:${r.product_name}`
    if (!dateProdCostMap.has(dpKey)) dateProdCostMap.set(dpKey, [])
    dateProdCostMap.get(dpKey)!.push({ qty: r.quantity_kg, price: r.price_per_ton })
    const ymKey = `${r.year_month}:${r.product_name}`
    if (!ymProdCostMap.has(ymKey)) ymProdCostMap.set(ymKey, [])
    ymProdCostMap.get(ymKey)!.push(r.price_per_ton)
  }

  function representativePrice(prices: number[]): number {
    const freq = new Map<number, number>()
    for (const p of prices) freq.set(p, (freq.get(p) ?? 0) + 1)
    const maxFreq = Math.max(...freq.values())
    const modes = [...freq.entries()].filter(([, f]) => f === maxFreq).map(([p]) => p)
    modes.sort((a, b) => a - b)
    return modes[Math.floor(modes.length / 2)]
  }

  interface Delivery {
    delivery_date: string
    year_month: string
    product_name: string
    quantity_kg: number
    sell_price: number
    cost_price: number
    currency: 'KRW' | 'USD'
    cost_match_level: 1 | 2 | 3 | 0
  }

  const deliveries: Delivery[] = []
  let matchL1 = 0, matchL2 = 0, matchL3 = 0, noMatch = 0

  for (const r of sellRows) {
    let costPrice: number | undefined
    let matchLevel: 1 | 2 | 3 | 0 = 0

    // L1: 정확
    costPrice = exactCostMap.get(`${r.delivery_date}:${r.product_name}:${r.quantity_kg}`)
    if (costPrice !== undefined) { matchLevel = 1 }

    // L2: 날짜+품목, 물량 근사
    if (!matchLevel) {
      const candidates = dateProdCostMap.get(`${r.delivery_date}:${r.product_name}`)
      if (candidates?.length) {
        const closest = candidates.reduce((best, c) =>
          Math.abs(c.qty - r.quantity_kg) < Math.abs(best.qty - r.quantity_kg) ? c : best
        )
        costPrice = closest.price
        matchLevel = 2
      }
    }

    // L3: 연월+품목 대표값
    if (!matchLevel) {
      const prices = ymProdCostMap.get(`${r.year_month}:${r.product_name}`)
      if (prices?.length) { costPrice = representativePrice(prices); matchLevel = 3 }
    }

    if (matchLevel === 1) matchL1++
    else if (matchLevel === 2) matchL2++
    else if (matchLevel === 3) matchL3++
    else noMatch++

    deliveries.push({
      delivery_date:    r.delivery_date,
      year_month:       r.year_month,
      product_name:     r.product_name,
      quantity_kg:      r.quantity_kg,
      sell_price:       r.price_per_ton,
      cost_price:       costPrice ?? 0,
      currency:         CONFIG.productCurrencyMap[r.product_name] ?? 'KRW',
      cost_match_level: matchLevel,
    })
  }

  console.log(`  매핑 완료: ${deliveries.length}건 | L1(정확)=${matchL1} L2(날짜+품목)=${matchL2} L3(연월)=${matchL3} 미매핑=${noMatch}`)

  // ── 3. 품목 조회 + 없으면 자동 생성 ──────────────────────────────────────
  console.log('\n[3/5] 품목 조회 / 자동 생성...')
  const { data: products, error: pErr } = await supabase
    .from('products').select('id, name')
  if (pErr) { console.error('❌', pErr.message); process.exit(1) }

  const productMap = new Map<string, string>()
  for (const p of products ?? []) productMap.set(p.name.toUpperCase(), p.id)

  // 엑셀에 있는데 DB에 없는 품목 → 자동 생성
  const neededProducts = [...new Set(deliveries.map(d => d.product_name))]
  for (const name of neededProducts) {
    if (productMap.has(name)) continue
    const defaults = CONFIG.productDefaults[name]
    if (!defaults) {
      console.warn(`  ⚠ 품목 기본값 없음: ${name} → 스킵`)
      continue
    }
    if (DRY_RUN) {
      console.log(`  [DRY] INSERT product: ${name} (${defaults.display_name})`)
      productMap.set(name, `dry-product-${name}`)
      continue
    }
    const { data: np, error: npErr } = await supabase
      .from('products')
      .insert({ name, ...defaults })
      .select('id').single()
    if (npErr) {
      console.error(`  ❌ 품목 생성 실패 (${name}): ${npErr.message}`)
    } else {
      console.log(`  ✅ 품목 자동 생성: ${name} (${defaults.display_name})`)
      productMap.set(name, np.id)
    }
  }
  console.log(`  최종 품목: ${[...productMap.keys()].join(', ')}`)

  // ── 4. contracts insert ────────────────────────────────────────────────────
  console.log('\n[4/5] 낙찰 단가(contracts) 처리...')

  // 기존 contracts 로드
  const { data: existContracts } = await supabase
    .from('contracts').select('id, product_id, start_date, end_date, sell_price, cost_price')
  const existContractSet = new Set(
    (existContracts ?? []).map(c =>
      `${c.product_id}:${c.start_date.slice(0,10)}:${c.sell_price}:${c.cost_price}`
    )
  )
  // 기존 계약 ID 맵 (product_id:sell_price:cost_price → id)
  const existContractIdMap = new Map<string, string>()
  for (const c of existContracts ?? []) {
    existContractIdMap.set(
      `${c.product_id}:${c.start_date.slice(0,10)}:${c.sell_price}:${c.cost_price}`, c.id
    )
    existContractIdMap.set(`${c.product_id}:${c.sell_price}:${c.cost_price}`, c.id)
  }

  // 계약 후보 추출: (product, sell_price, cost_price) 별 날짜 범위
  const contractCandidates = new Map<string, {
    product_name: string
    sell_price: number
    cost_price: number
    currency: 'KRW' | 'USD'
    minDate: string
    maxDate: string
  }>()
  for (const d of deliveries) {
    if (!productMap.has(d.product_name)) continue
    const key = `${d.product_name}:${d.sell_price}:${d.cost_price}`
    const ex = contractCandidates.get(key)
    if (!ex) {
      contractCandidates.set(key, {
        product_name: d.product_name,
        sell_price:   d.sell_price,
        cost_price:   d.cost_price,
        currency:     d.currency,
        minDate:      d.delivery_date,
        maxDate:      d.delivery_date,
      })
    } else {
      if (d.delivery_date < ex.minDate) ex.minDate = d.delivery_date
      if (d.delivery_date > ex.maxDate) ex.maxDate = d.delivery_date
    }
  }

  console.log(`  추출된 계약 패턴: ${contractCandidates.size}개`)

  // 새 계약 ID 맵 (product_name:sell:cost → id)
  const newContractIdMap = new Map<string, string>()
  let cInserted = 0, cSkipped = 0, cErrors = 0

  for (const [key, c] of contractCandidates) {
    const productId = productMap.get(c.product_name)!
    const dupKey = `${productId}:${c.minDate}:${c.sell_price}:${c.cost_price}`
    const loosenKey = `${productId}:${c.sell_price}:${c.cost_price}`

    // 이미 있으면 skip
    const existId = existContractIdMap.get(dupKey) ?? existContractIdMap.get(loosenKey)
    if (existId) {
      console.log(`  ⏭ 이미 존재: ${c.product_name} 판매${c.sell_price/1000}원/kg 원가${c.cost_price/1000}원/kg`)
      newContractIdMap.set(key, existId)
      cSkipped++
      continue
    }

    const payload = {
      product_id:   productId,
      start_date:   c.minDate,
      end_date:     c.maxDate,
      sell_price:   c.sell_price,
      cost_price:   c.cost_price,
      currency:     c.currency,
      reference_exchange_rate: null,
      exchange_rate_basis:     null,
      memo: `엑셀 이전 (${c.minDate}~${c.maxDate})`,
    }

    if (DRY_RUN) {
      console.log(`  [DRY] INSERT contract: ${c.product_name} 판매${c.sell_price/1000}원/kg 원가${c.cost_price/1000}원/kg (${c.minDate}~${c.maxDate})`)
      newContractIdMap.set(key, `dry-${key}`)
      cInserted++
      continue
    }

    const { data: nc, error: ncErr } = await supabase
      .from('contracts').insert(payload).select('id').single()
    if (ncErr) {
      console.error(`  ❌ 계약 실패 (${c.product_name}): ${ncErr.message}`)
      cErrors++
    } else {
      console.log(`  ✅ 계약 등록: ${c.product_name} 판매${c.sell_price/1000}원/kg 원가${c.cost_price/1000}원/kg`)
      newContractIdMap.set(key, nc.id)
      cInserted++
    }
  }

  // ── 5. deliveries insert ───────────────────────────────────────────────────
  console.log('\n[5/5] 입고 데이터(deliveries) 처리...')

  // 기존 deliveries 중복 체크
  const { data: existDeliv } = await supabase
    .from('deliveries').select('delivery_date, product_id, quantity_kg')
  const existDelivSet = new Set(
    (existDeliv ?? []).map(d => `${d.delivery_date}:${d.product_id}:${d.quantity_kg}`)
  )

  let dInserted = 0, dSkipped = 0, dErrors = 0
  const BATCH = 50  // 배치 크기

  const toInsert: object[] = []

  for (const d of deliveries) {
    const productId = productMap.get(d.product_name)
    if (!productId) { dSkipped++; continue }

    const contractKey = `${d.product_name}:${d.sell_price}:${d.cost_price}`
    const contractId  = newContractIdMap.get(contractKey)
      ?? existContractIdMap.get(`${productId}:${d.sell_price}:${d.cost_price}`)

    if (!contractId) {
      console.warn(`  ⚠ 계약 없음: ${d.delivery_date} ${d.product_name}, 스킵`)
      dSkipped++
      continue
    }

    const dupKey = `${d.delivery_date}:${productId}:${d.quantity_kg}`
    if (existDelivSet.has(dupKey)) { dSkipped++; continue }

    if (DRY_RUN) {
      console.log(`  [DRY] INSERT delivery: ${d.delivery_date} ${d.product_name} ${(d.quantity_kg/1000).toFixed(3)}톤`)
      dInserted++
      existDelivSet.add(dupKey)
      continue
    }

    toInsert.push({
      year_month:    d.year_month,
      delivery_date: d.delivery_date,
      product_id:    productId,
      contract_id:   contractId,
      quantity_kg:   d.quantity_kg,
      memo:          null,
    })
    existDelivSet.add(dupKey)

    // 배치 실행
    if (toInsert.length >= BATCH) {
      const { error: bErr } = await supabase.from('deliveries').insert(toInsert)
      if (bErr) {
        console.error(`  ❌ 배치 insert 실패: ${bErr.message}`)
        dErrors += toInsert.length
      } else {
        dInserted += toInsert.length
        process.stdout.write(`  진행: ${dInserted}건\r`)
      }
      toInsert.length = 0
    }
  }

  // 나머지 처리
  if (!DRY_RUN && toInsert.length > 0) {
    const { error: bErr } = await supabase.from('deliveries').insert(toInsert)
    if (bErr) {
      console.error(`  ❌ 마지막 배치 실패: ${bErr.message}`)
      dErrors += toInsert.length
    } else {
      dInserted += toInsert.length
    }
  }

  // ── 결과 리포트 ────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50))
  console.log('📊 이전 결과 리포트')
  console.log('═'.repeat(50))
  console.log('\n낙찰 단가 (contracts):')
  console.log(`  ✅ 신규 등록:  ${cInserted}건`)
  console.log(`  ⏭ 이미 존재:  ${cSkipped}건`)
  console.log(`  ❌ 오류:       ${cErrors}건`)
  console.log('\n입고 데이터 (deliveries):')
  console.log(`  ✅ 신규 등록:  ${dInserted}건`)
  console.log(`  ⏭ 이미 존재/스킵: ${dSkipped}건`)
  console.log(`  ❌ 오류:       ${dErrors}건`)
  if (noMatch > 0)
    console.log(`\n  ℹ 원가 미매핑 ${noMatch}건은 cost_price=0으로 등록됨. 낙찰단가 관리에서 수동 수정 필요.`)
  if (matchL3 > 0)
    console.log(`  ℹ L3 연월 대표값 ${matchL3}건: Sheet3에 정확한 원가 없어 해당 월 최빈 원가 사용.`)
  console.log()
  if (DRY_RUN) {
    console.log('✅ DRY-RUN 완료. 실제 import 하려면 --dry-run 없이 실행하세요.\n')
  } else {
    console.log(cErrors + dErrors === 0 ? '✅ 이전 완료.\n' : `⚠ ${cErrors + dErrors}건 오류. 위 로그 확인.\n`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 진입점
// ─────────────────────────────────────────────────────────────────────────────
if (INSPECT) {
  runInspect()
} else {
  runImport().catch(err => { console.error('❌ 오류:', err); process.exit(1) })
}
