import 'server-only'
import type { User } from '@supabase/supabase-js'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export type AuthResult = { user: User } | { error: string }

/** 현재 로그인 사용자 (쿠키 세션 기반). 없으면 에러. */
export async function getCurrentUser(): Promise<AuthResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { error: '로그인이 필요합니다.' }
  return { user: data.user }
}

/** 역할 조회 — service-role로 RLS 우회 읽기 */
export async function getRole(userId: string): Promise<'owner' | 'rep' | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('user_roles').select('role').eq('user_id', userId).single()
  return (data?.role as 'owner' | 'rep' | undefined) ?? null
}

/** owner 전용 액션 가드. owner가 아니면 에러 반환. */
export async function requireOwner(): Promise<AuthResult> {
  const auth = await getCurrentUser()
  if ('error' in auth) return auth
  const role = await getRole(auth.user.id)
  if (role !== 'owner') return { error: '권한이 없습니다. (관리자 전용)' }
  return auth
}
