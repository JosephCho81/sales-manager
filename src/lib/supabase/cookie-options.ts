import type { CookieOptions } from '@supabase/ssr'

/**
 * 세션 쿠키 정책 — 서버 클라이언트와 proxy가 같은 값을 써야 한다.
 *
 * httpOnly: 세션 토큰을 JS에서 못 읽게 한다. @supabase/ssr 기본값은 false(브라우저
 *   클라이언트가 쿠키를 읽어야 하므로)지만, 이 앱은 로그인·로그아웃·데이터 접근이
 *   전부 서버에서 일어나므로 브라우저가 토큰을 볼 이유가 없다 → XSS로 세션 탈취 차단.
 * secure: 프로덕션(HTTPS)에서만. 로컬 http 개발에서 켜면 쿠키가 아예 안 붙는다.
 * maxAge: 400일 — "한 번 로그인하면 계속 유지" 요구사항. 리프레시 토큰이 갱신될
 *   때마다 쿠키도 다시 써지므로 실사용 중에는 만료되지 않는다.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 400 * 24 * 60 * 60,
}
