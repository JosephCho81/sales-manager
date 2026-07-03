import 'server-only'
import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'

type AuditEntry = {
  table: string
  rowId: string | null
  action: 'insert' | 'update' | 'delete'
  before?: unknown
  after?: unknown
}

/**
 * 감사 로그 기록. 쓰기는 service-role이라 DB에 auth.uid()가 안 남으므로
 * 액션에서 받은 사용자를 명시적으로 기록한다.
 * 로깅 실패가 본 작업을 막지 않도록 에러는 삼키고 콘솔에만 남긴다.
 */
export async function logAudit(actor: User, entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      actor_email: actor.email ?? null,
      actor_id: actor.id,
      table_name: entry.table,
      row_id: entry.rowId,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
    })
  } catch (e) {
    console.error('[audit_log] 기록 실패:', e)
  }
}
