'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 공휴일 추가. 지급일 계산의 기준 데이터라 형식 검증을 코드로 강제한다.
 * 저장 후 해당 월 계산서를 자동 재생성하지는 않는다 — 이미 발행된 계산서의
 * 날짜를 말없이 바꾸면 실물과 어긋나므로, 재생성은 사용자가 판단해서 누른다.
 */
export async function addHoliday(date: string, name: string): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const d = date.trim()
  const n = name.trim()
  if (!DATE_RE.test(d)) return { error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' }
  if (Number.isNaN(new Date(d).getTime())) return { error: '존재하지 않는 날짜입니다.' }
  if (!n) return { error: '공휴일 이름을 입력하세요.' }
  if (n.length > 60) return { error: '이름은 60자 이내로 입력하세요.' }

  const supabase = createAdminClient()
  const { error } = await supabase.from('holidays').insert({ date: d, name: n })
  if (error) {
    if (error.code === '23505') return { error: '이미 등록된 날짜입니다.' }
    return { error: error.message }
  }
  await logAudit(auth.user, { table: 'holidays', rowId: d, action: 'insert', after: { date: d, name: n } })
  return { success: true }
}

export async function deleteHoliday(date: string): Promise<{ error?: string; success?: true }> {
  const auth = await requireOwner()
  if ('error' in auth) return { error: auth.error }

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('holidays').delete().eq('date', date).select('date, name')
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: '대상 공휴일이 없습니다. 새로고침 후 다시 시도하세요.' }
  await logAudit(auth.user, { table: 'holidays', rowId: date, action: 'delete', before: data[0] })
  return { success: true }
}
