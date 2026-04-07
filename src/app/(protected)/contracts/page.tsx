import { createAdminClient } from '@/lib/supabase/server'
import ContractsClient from './ContractsClient'

export const dynamic = 'force-dynamic'

export default async function ContractsPage() {
  let products: unknown[] = []
  let contracts: unknown[] = []
  let fetchError: string | null = null

  try {
    const supabase = createAdminClient()
    const [pResult, cResult] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('display_name'),
      supabase
        .from('contracts')
        .select('*, product:products(id, name, display_name, price_unit)')
        .order('start_date', { ascending: false }),
    ])

    if (pResult.error) {
      console.error('[contracts] products error:', pResult.error)
      fetchError = pResult.error.message
    } else if (cResult.error) {
      console.error('[contracts] contracts error:', cResult.error)
      fetchError = cResult.error.message
    } else {
      products = pResult.data ?? []
      contracts = cResult.data ?? []
    }
  } catch (e) {
    console.error('[contracts] unexpected error:', e)
    fetchError = e instanceof Error ? e.message : String(e)
  }

  if (fetchError) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-red-600 mb-2">데이터 로드 오류</h2>
        <div className="bg-red-50 border border-red-200 rounded p-3 font-mono text-xs text-red-800 mb-4">
          {fetchError}
        </div>
        <p className="text-sm text-gray-500">
          Supabase 마이그레이션 실행 여부를 확인하세요.
        </p>
      </div>
    )
  }

  return (
    <ContractsClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialContracts={contracts as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products={products as any[]}
    />
  )
}
