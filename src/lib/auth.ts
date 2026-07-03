import 'server-only'
import type { User } from '@supabase/supabase-js'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export type AuthResult = { user: User } | { error: string }

/**
 * [로그인 비활성화] (protected)/layout.tsx의 로그인 비활성화와 반드시 짝으로 관리.
 * true인 동안 requireOwner가 시스템 사용자로 통과 — URL을 아는 누구나 수정 가능.
 * 로그인 재활성화 시: 이 값을 false로 + layout.tsx 인증 체크 복원.
 * (2026-07-03: 가드 배포 후 세션이 없어 모든 저장·수정이 침묵 실패했던 사고의 임시 해제)
 */
const AUTH_DISABLED = true

/** 로그인 비활성화 기간의 audit_log 표기용 가상 사용자 */
const SYSTEM_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'auth-disabled@system',
  aud: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '',
} as User

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
  if (AUTH_DISABLED) return { user: SYSTEM_USER }
  const auth = await getCurrentUser()
  if ('error' in auth) return auth
  const role = await getRole(auth.user.id)
  if (role !== 'owner') return { error: '권한이 없습니다. (관리자 전용)' }
  return auth
}
