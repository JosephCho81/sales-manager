'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** 로그아웃 — 세션 쿠키가 httpOnly라 브라우저에서 지울 수 없으므로 서버에서 처리 */
export async function logout(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
