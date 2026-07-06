import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { decodePathname, normalizePathname } from '@/lib/normalize-path'


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
  await supabase.auth.getUser()

  return supabaseResponse
}

export const proxyConfig = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
