/**
 * DB raw 입고 데이터 → DeliveryForInvoice 변환
 * InvoicesClient에서 분리 — 데이터 변환 로직만 포함
 */
import type { DeliveryForInvoice } from './types'

export type DeliveryRaw = {
  id: string
  year_month: string
  delivery_date: string | null
  product_id: string
  quantity_kg: number
  addl_quantity_kg: number | null
  addl_margin_per_ton: number | null
  hoejin_shortage_kg: number | null
  hoejin_shortage_price: number | null
  depreciation_amount: number | null
  product: { id: string; name: string; display_name: string; vat: string } | null
  contract: {
    id: string
    sell_price: number
    cost_price: number
    currency: string
    reference_exchange_rate: number | null
  } | null
}

export type FxRateRaw = {
  id: string
  bl_date: string
  product_id: string
  rate_krw_per_usd: number
}

export function mapDeliveries(
  deliveries: DeliveryRaw[],
  fxRates: FxRateRaw[],
): DeliveryForInvoice[] {
  const fxRateMap = new Map<string, number>()
  for (const r of fxRates) {
    fxRateMap.set(`${r.product_id}:${r.bl_date}`, Number(r.rate_krw_per_usd))
  }

  return deliveries
    .filter(d => d.product && d.contract)
    .map(d => ({
      id: d.id,
      year_month: d.year_month,
      delivery_date: d.delivery_date,
      product_id: d.product_id,
      product_name: d.product!.name,
      product_vat: d.product!.vat,
      quantity_kg: Number(d.quantity_kg),
      addl_quantity_kg: d.addl_quantity_kg != null ? Number(d.addl_quantity_kg) : null,
      addl_margin_per_ton: d.addl_margin_per_ton != null ? Number(d.addl_margin_per_ton) : null,
      hoejin_shortage_kg: d.hoejin_shortage_kg != null ? Number(d.hoejin_shortage_kg) : null,
      hoejin_shortage_price: d.hoejin_shortage_price != null ? Number(d.hoejin_shortage_price) : null,
      depreciation_amount: d.depreciation_amount != null ? Number(d.depreciation_amount) : null,
      fx_rate: d.delivery_date
        ? (fxRateMap.get(`${d.product_id}:${d.delivery_date}`) ?? null)
        : null,
      contract: {
        sell_price: Number(d.contract!.sell_price),
        cost_price: Number(d.contract!.cost_price),
        currency: d.contract!.currency,
        reference_exchange_rate:
          d.contract!.reference_exchange_rate != null
            ? Number(d.contract!.reference_exchange_rate)
            : null,
      },
    }))
}
