'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { usernameToEmail } from '@/lib/account'

export type LoginState = { error: string } | null

/**
 * 로그인은 서버 액션으로만 처리한다 — 세션 쿠키를 httpOnly로 굽기 위해서다.
 * (브라우저 클라이언트로 로그인하면 document.cookie에 토큰이 남아 XSS에 노출)
 * 실패 사유는 아이디/비밀번호를 구분하지 않는다 (계정 존재 여부 노출 방지).
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const FAIL = { error: '아이디 또는 비밀번호가 올바르지 않습니다.' }

  const email    = usernameToEmail(String(formData.get('username') ?? ''))
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return FAIL

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return FAIL

  redirect('/analytics')
}
