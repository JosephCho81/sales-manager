import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import FetchErrorView from '@/components/FetchErrorView'
import CommissionClient from './CommissionClient'
import type { CommissionRow } from './types'

export const dynamic = 'force-dynamic'

export default async function CommissionPage() {
  let rows: CommissionRow[] = []
  let fetchError: string | null = null

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('commissions')
      .select('*')
      .order('year_month', { ascending: false })
      .limit(60)
    if (error) fetchError = error.message
    else rows = (data ?? []) as CommissionRow[]
  } catch (e) {
    fetchError = toMessage(e)
  }

  if (fetchError) return <FetchErrorView message={fetchError} />

  return <CommissionClient initialRows={rows} />
}
