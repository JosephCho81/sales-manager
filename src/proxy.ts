import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { decodePathname, normalizePathname } from '@/lib/normalize-path'
import { SESSION_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options'

/** 로그인 없이 접근 가능한 경로 */
const PUBLIC_PATHS = ['/login']

/**
 * 인증 리다이렉트를 건너뛸 경로.
 *
 * matcher가 이미 걸러주지만 여기서 한 번 더 본다 — matcher 설정이 틀리면
 * (예: export 이름을 잘못 써서 무시되면) CSS·JS까지 /login으로 튕겨
 * 화면이 통째로 스타일 없이 뜬다. 실제로 그렇게 깨졌던 적이 있다.
 */
function isAssetPath(pathname: string): boolean {
  return pathname.startsWith('/_next')
    || pathname === '/favicon.ico'
    || /\.[a-z0-9]+$/i.test(pathname)   // 확장자가 붙은 요청은 정적 파일
}


export async function proxy(request: NextRequest) {
  // 카톡 등 메신저를 거치며 변형된 URL(/Analytics, /analytics. 등) 교정
  // 비교는 디코딩된 경로끼리 — 한글 등 정상 인코딩 경로의 리다이렉트 루프 방지
  const normalizedPath = normalizePathname(request.nextUrl.pathname)
  if (normalizedPath !== decodePathname(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = normalizedPath
    return NextResponse.redirect(url, 308)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 세션 토큰 갱신 (쿠키 자동 업데이트)
  const { data: { user } } = await supabase.auth.getUser()

  // 미로그인은 렌더 전에 차단 — layout 가드보다 앞단이라 페이지가 잠깐도 안 보인다.
  // 권한(owner/viewer) 판정은 여기서 하지 않는다: 역할 조회에 service-role이
  // 필요하고, 실제 경계는 서버 액션의 requireOwner다.
  const path = normalizedPath
  if (!user && !PUBLIC_PATHS.includes(path) && !isAssetPath(path)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Next는 `config`라는 이름의 export만 읽는다. 다른 이름으로 두면 matcher가
// 조용히 무시돼 모든 요청이 미들웨어를 타므로 이름을 바꾸지 말 것.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|ico|woff2?)$).*)',
  ],
}
