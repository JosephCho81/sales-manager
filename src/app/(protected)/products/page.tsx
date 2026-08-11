import { toMessage } from '@/lib/error'
import { createAdminClient } from '@/lib/supabase/server'
import { hydrateHolidays, fetchHolidays, uncoveredHolidayYears } from '@/lib/holidays'
import { getCurrentYearMonth } from '@/lib/date'
import ProductsClient from './ProductsClient'
import HolidayPanel from './HolidayPanel'
import FetchErrorView from '@/components/FetchErrorView'
import type { Product } from '@/types'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  try {
    const supabase = createAdminClient()
    const [{ data, error }, holidays] = await Promise.all([
      supabase.from('products').select('*').order('display_name'),
      fetchHolidays(),
    ])

    if (error) throw new Error(error.message)

    // 미등록 연도 판정은 DB 값을 반영한 뒤에 — 올해부터 내년까지를 본다
    await hydrateHolidays()
    const uncovered = uncoveredHolidayYears(getCurrentYearMonth())

    return (
      <>
        <ProductsClient initialProducts={(data ?? []) as unknown as Product[]} />
        <HolidayPanel holidays={holidays} uncoveredYears={uncovered} />
      </>
    )
  } catch (e) {
    return (
      <FetchErrorView
        message={toMessage(e)}
        hint="Supabase 마이그레이션 실행 여부를 확인하세요. (supabase/migrations/001_initial.sql)"
      />
    )
  }
}
