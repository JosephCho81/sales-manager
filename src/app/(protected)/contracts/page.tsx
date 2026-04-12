import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import { supabaseFetch } from '@/lib/supabase/fetch'
import ContractsClient from './ContractsClient'
import FetchErrorView from '@/components/FetchErrorView'

export const dynamic = 'force-dynamic'

export default async function ContractsPage() {
  try {
    const supabase = createAdminClient()
    const [products, contracts] = await Promise.all([
      supabaseFetch(supabase.from('products').select('*').eq('is_active', true).order('display_name')),
      supabaseFetch(
        supabase
          .from('contracts')
          .select('*, product:products(id, name, display_name, price_unit)')
          .order('start_date', { ascending: false })
      ),
    ])

    return (
      <ContractsClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialContracts={contracts as any[]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        products={products as any[]}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} hint="Supabase 마이그레이션 실행 여부를 확인하세요." />
  }
}
