import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import ProductsClient from './ProductsClient'
import FetchErrorView from '@/components/FetchErrorView'
import type { Product } from '@/types'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('display_name')

    if (error) throw new Error(error.message)

    return <ProductsClient initialProducts={(data ?? []) as unknown as Product[]} />
  } catch (e) {
    return (
      <FetchErrorView
        message={toMessage(e)}
        hint="Supabase 마이그레이션 실행 여부를 확인하세요. (supabase/migrations/001_initial.sql)"
      />
    )
  }
}
