import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import ProductsClient from './ProductsClient'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  let products: unknown[] = []
  let fetchError: string | null = null

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('display_name')

    if (error) {
      console.error('[products] supabase error:', error)
      fetchError = error.message
    } else {
      products = data ?? []
    }
  } catch (e) {
    console.error('[products] unexpected error:', e)
    fetchError = toMessage(e)
  }

  if (fetchError) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-red-600 mb-2">데이터 로드 오류</h2>
        <p className="text-sm text-gray-700 mb-4">
          품목 데이터를 불러오는 중 오류가 발생했습니다.
        </p>
        <div className="bg-red-50 border border-red-200 rounded p-3 font-mono text-xs text-red-800">
          {fetchError}
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Supabase 대시보드에서 SQL 마이그레이션이 실행되었는지 확인하세요.
          (<code>supabase/migrations/001_initial.sql</code>)
        </p>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <ProductsClient initialProducts={products as any[]} />
}
