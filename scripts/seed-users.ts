/**
 * 로그인 계정 프로비저닝 (kim / choi / cho)
 *
 *   npm run seed:users -- "비밀번호"
 *   또는  $env:SEED_PASSWORD="비밀번호"; npm run seed:users
 *
 * 비밀번호는 절대 소스에 넣지 않는다 — 인자/환경변수로만 받는다.
 * 이미 있는 계정은 비밀번호만 재설정하고, 역할(user_roles)은 항상 덮어쓴다.
 * 실행 전 supabase/migrations/017_user_roles_and_rls_lockdown.sql 적용 필요.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { usernameToEmail, type Role } from '../src/lib/account'

const ACCOUNTS: { username: string; role: Role }[] = [
  { username: 'cho',  role: 'owner'  },  // 입력·수정 가능
  { username: 'kim',  role: 'viewer' },  // 조회 전용
  { username: 'choi', role: 'viewer' },  // 조회 전용
]

// .env.local 로더 (tsx는 Next처럼 자동 로드하지 않는다)
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
    const value = m[2].trim().replace(/^["'](.*)["']$/, '$1')
    if (!process.env[m[1]]) process.env[m[1]] = value
  }
}

async function main() {
  loadEnvLocal()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const password = process.argv[2] ?? process.env.SEED_PASSWORD

  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음 (.env.local 확인)')
  if (!password) throw new Error('비밀번호 인자 없음 — npm run seed:users -- "비밀번호"')
  if (password.length < 10) throw new Error('비밀번호는 10자 이상이어야 합니다.')

  const admin = createClient(url, key, { auth: { persistSession: false } })

  const { data: existing, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) throw new Error(`사용자 목록 조회 실패: ${listErr.message}`)

  for (const { username, role } of ACCOUNTS) {
    const email = usernameToEmail(username)
    if (!email) throw new Error(`아이디 형식 오류: ${username}`)

    const found = existing.users.find(u => u.email === email)
    let userId: string

    if (found) {
      const { error } = await admin.auth.admin.updateUserById(found.id, { password })
      if (error) throw new Error(`${username} 비밀번호 재설정 실패: ${error.message}`)
      userId = found.id
      console.log(`· ${username} (${email}) — 기존 계정 비밀번호 재설정`)
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (error || !data.user) throw new Error(`${username} 생성 실패: ${error?.message}`)
      userId = data.user.id
      console.log(`· ${username} (${email}) — 신규 생성`)
    }

    const { error: roleErr } = await admin.from('user_roles').upsert(
      { user_id: userId, username, role, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    if (roleErr) throw new Error(`${username} 역할 저장 실패: ${roleErr.message}`)
    console.log(`  역할: ${role}`)
  }

  console.log('\n완료. 로그인 화면에서 아이디(kim/choi/cho) + 비밀번호로 접속하세요.')
}

main().catch(e => {
  console.error(`\n실패: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
