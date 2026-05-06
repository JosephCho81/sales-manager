import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import { supabaseFetch } from '@/lib/supabase/fetch'
import ContractsClient from './ContractsClient'
import FetchErrorView from '@/components/FetchErrorView'
import type { ContractRow } from './types'
import type { Product } from '@/types'

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
        initialContracts={contracts as unknown as ContractRow[]}
        products={products as unknown as Product[]}
      />
    )
  } catch (e) {
    return <FetchErrorView message={toMessage(e)} hint="Supabase 마이그레이션 실행 여부를 확인하세요." />
  }
}
