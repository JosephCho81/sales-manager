/**
 * 마이그레이션 적용 상태 점검 —  npm run check:schema
 *
 * 마이그레이션은 Supabase SQL 에디터에서 손으로 돌리기 때문에, 코드가 기대하는
 * 컬럼이 실제 DB에 있는지 어긋나기 쉽다. 배포 전/후 이 스크립트로 먼저 확인한다.
 * (읽기 전용 — 아무것도 바꾸지 않는다)
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

/** 마이그레이션별로 "이게 있으면 적용된 것"인 대표 컬럼 */
const CHECKS: { migration: string; table: string; column: string }[] = [
  { migration: '017 역할',        table: 'user_roles',            column: 'username' },
  { migration: '017 역할',        table: 'user_roles',            column: 'updated_at' },
  { migration: '018 공휴일',      table: 'holidays',              column: 'date' },
  { migration: '019 낙관적잠금',  table: 'contracts',             column: 'updated_at' },
  { migration: '019 낙관적잠금',  table: 'deliveries',            column: 'updated_at' },
  { migration: '019 낙관적잠금',  table: 'products',              column: 'updated_at' },
  { migration: '019 낙관적잠금',  table: 'expenses',              column: 'updated_at' },
  { migration: '019 낙관적잠금',  table: 'monthly_depreciations', column: 'updated_at' },
  { migration: '020 실물대사',    table: 'invoice_instructions',  column: 'reconciled_at' },
  { migration: '020 실물대사',    table: 'invoice_instructions',  column: 'actual_supply_amount' },
  { migration: '023 감가통보일',  table: 'monthly_depreciations', column: 'notified_on' },
]

function loadEnvLocal(): void {
  let raw: string
  try {
    raw = readFileSync('.env.local', 'utf8')
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1')
  }
}

async function main() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음 (.env.local 확인)')

  const admin = createClient(url, key, { auth: { persistSession: false } })
  const missing: string[] = []

  for (const c of CHECKS) {
    const { error } = await admin.from(c.table).select(c.column).limit(1)
    const ok = !error
    if (!ok) missing.push(c.migration)
    console.log(`${ok ? '  OK  ' : ' 없음 '} ${c.migration.padEnd(14)} ${c.table}.${c.column}`)
  }

  const { data: roles, error: rErr } = await admin.from('user_roles').select('username, role')
  console.log('\nuser_roles:', rErr ? `조회 실패 — ${rErr.message}` : JSON.stringify(roles))

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 })
  console.log('auth 계정:', users?.users.map(u => u.email).sort().join(', ') || '(없음)')

  if (missing.length > 0) {
    console.log(`\n미적용: ${[...new Set(missing)].join(', ')} — supabase/migrations의 해당 SQL을 Supabase SQL 에디터에서 실행하세요.`)
    process.exit(1)
  }
  console.log('\n모든 마이그레이션 적용됨.')
}

main().catch(e => {
  console.error(`\n실패: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
