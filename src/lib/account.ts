/**
 * 로그인 계정 공용 정의 — 클라이언트(로그인 폼)·서버·시드 스크립트가 함께 쓴다.
 * Supabase Auth는 이메일만 받으므로 아이디(kim/choi/cho)를 내부 이메일로 매핑한다.
 * 실제로 메일을 보내지 않는 도메인 — 계정 확인은 시드 스크립트에서 email_confirm으로 끝낸다.
 */
export const EMAIL_DOMAIN = 'sales.local'

/** 아이디 형식: 소문자·숫자·밑줄 2~20자 (폼 입력을 이메일로 만들기 전 검증) */
const USERNAME_RE = /^[a-z0-9_]{2,20}$/

export type Role = 'owner' | 'viewer'

/** 아이디 → 내부 이메일. 형식이 틀리면 null (호출부에서 로그인 실패 처리) */
export function usernameToEmail(input: string): string | null {
  const username = input.trim().toLowerCase()
  if (!USERNAME_RE.test(username)) return null
  return `${username}@${EMAIL_DOMAIN}`
}

/**
 * 아이디별 화면 표시 이름. 3개 고정 계정이라 코드에 둔다 —
 * 여기 없는 아이디는 아이디를 그대로 쓴다(계정을 늘려도 화면이 깨지지 않게).
 */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  kim:  '(주)나성 김주종 대표님',
  choi: '(주)한국에이원 최성호 대표님',
  cho:  '(주)금화 조중호 대표님',
}

export function displayNameFor(username: string): string {
  return DISPLAY_NAMES[username] ?? username
}

/** 내부 이메일 → 아이디 (헤더 표시용) */
export function emailToUsername(email: string | null | undefined): string {
  if (!email) return ''
  return email.endsWith(`@${EMAIL_DOMAIN}`) ? email.slice(0, -(EMAIL_DOMAIN.length + 1)) : email
}
