import 'server-only'
import type { User } from '@supabase/supabase-js'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { emailToUsername, displayNameFor, type Role } from '@/lib/account'

export type AuthResult = { user: User } | { error: string }

export type SessionInfo = {
  user: User
  username: string
  /** 화면 상단 표시용 이름 (예: '(주)금화 조중호 대표님') */
  displayName: string
  role: Role
  /** owner만 입력·수정·삭제 가능 */
  canEdit: boolean
}

/** 현재 로그인 사용자 (쿠키 세션 기반). 없으면 에러. */
export async function getCurrentUser(): Promise<AuthResult> {
  const supabase = await createClient()
  // getUser()는 Auth 서버에 토큰을 검증시킨다 — getSession()의 쿠키 신뢰와 다름
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return { error: '로그인이 필요합니다.' }
  return { user: data.user }
}

/**
 * 역할 조회 — service-role로 RLS 우회 읽기.
 * user_roles에 행이 없으면 null → 권한 없음으로 취급(기본 거부).
 */
export async function getRole(userId: string): Promise<Role | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  const role = data?.role
  return role === 'owner' || role === 'viewer' ? role : null
}

/** 레이아웃·페이지용 세션 정보. 미로그인/역할 없음이면 null. */
export async function getSession(): Promise<SessionInfo | null> {
  const auth = await getCurrentUser()
  if ('error' in auth) return null
  const role = await getRole(auth.user.id)
  if (!role) return null
  const username = emailToUsername(auth.user.email)
  return {
    user: auth.user,
    username,
    displayName: displayNameFor(username),
    role,
    canEdit: role === 'owner',
  }
}

/**
 * 쓰기 액션 가드. owner가 아니면 에러 반환.
 * 모든 mutation 서버 액션의 첫 줄에서 호출한다 — UI 숨김은 편의일 뿐,
 * 실제 권한 경계는 여기 하나뿐이다.
 */
export async function requireOwner(): Promise<AuthResult> {
  const auth = await getCurrentUser()
  if ('error' in auth) return auth
  const role = await getRole(auth.user.id)
  if (role !== 'owner') return { error: '권한이 없습니다. (조회 전용 계정)' }
  return auth
}
