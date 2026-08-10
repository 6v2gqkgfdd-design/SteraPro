/**
 * Importeer Shopify-orders naar shopify_orders en koppel aan companies.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchRecentShopifyOrders } from '@/lib/shopify-admin'

export type ImportOrdersResult = {
  ok: boolean
  message: string
  fetched: number
  upserted: number
  linked: number
}

export async function importShopifyOrders(
  supabase: SupabaseClient,
  opts?: { companyId?: string; limit?: number }
): Promise<ImportOrdersResult> {
  const orders = await fetchRecentShopifyOrders({
    limit: opts?.limit ?? 100,
    status: 'any',
  })

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, email, shopify_customer_id')

  const byEmail = new Map<string, string>()
  const byCustomerId = new Map<string, string>()
  for (const c of companies ?? []) {
    const row = c as {
      id: string
      email: string | null
      shopify_customer_id: string | null
    }
    if (row.email) byEmail.set(row.email.trim().toLowerCase(), row.id)
    if (row.shopify_customer_id) {
      byCustomerId.set(String(row.shopify_customer_id), row.id)
    }
  }

  let upserted = 0
  let linked = 0

  for (const o of orders) {
    let companyId: string | null = null
    if (o.shopify_customer_id && byCustomerId.has(o.shopify_customer_id)) {
      companyId = byCustomerId.get(o.shopify_customer_id)!
    } else if (o.email && byEmail.has(o.email.trim().toLowerCase())) {
      companyId = byEmail.get(o.email.trim().toLowerCase())!
    }

    // Altijd alle recente orders upserten (koppeling via e-mail / customer-id).
    // Filter op company gebeurt in de UI; hier vullen we de globale tabel.
    if (companyId) linked++

    const { data: existing } = await supabase
      .from('shopify_orders')
      .select('id, company_id, delivery_status, scheduled_start, scheduled_end, location_id, delivery_notes')
      .eq('shopify_order_id', o.shopify_order_id)
      .maybeSingle()

    const base = {
      shopify_order_id: o.shopify_order_id,
      shopify_order_number: o.shopify_order_number,
      name: o.name,
      email: o.email,
      customer_name: o.customer_name,
      financial_status: o.financial_status,
      fulfillment_status: o.fulfillment_status,
      total_price_cents: o.total_price_cents,
      currency: o.currency,
      line_items: o.line_items,
      ordered_at: o.ordered_at,
      raw: o.raw,
      updated_at: new Date().toISOString(),
      // Behoud leveringsplanning bij her-import
      company_id: existing?.company_id || companyId,
    }

    if (existing) {
      const { error } = await supabase
        .from('shopify_orders')
        .update(base)
        .eq('id', (existing as { id: string }).id)
      if (!error) upserted++
    } else {
      const { error } = await supabase.from('shopify_orders').insert({
        ...base,
        delivery_status: 'unscheduled',
      })
      if (!error) upserted++
    }
  }

  return {
    ok: true,
    message: `${upserted} bestelling(en) bijgewerkt · ${linked} gekoppeld aan een klant (van ${orders.length} opgehaald)`,
    fetched: orders.length,
    upserted,
    linked,
  }
}
