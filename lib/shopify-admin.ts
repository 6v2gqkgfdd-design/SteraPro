/**
 * Minimale Shopify Admin API-helpers (client_credentials).
 */

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04'

export async function getShopifyAdminToken(): Promise<{
  shop: string
  token: string
  apiVersion: string
}> {
  const shop = process.env.SHOPIFY_STORE_DOMAIN
  if (!shop) throw new Error('SHOPIFY_STORE_DOMAIN ontbreekt')

  if (process.env.SHOPIFY_ADMIN_TOKEN) {
    return {
      shop,
      token: process.env.SHOPIFY_ADMIN_TOKEN,
      apiVersion: API_VERSION,
    }
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET ontbreken')
  }

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: 'no-store',
  })
  const json = (await res.json()) as { access_token?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(`Shopify token mislukt (${res.status})`)
  }
  return { shop, token: json.access_token, apiVersion: API_VERSION }
}

export type ShopifyOrderLine = {
  title: string
  quantity: number
  sku: string | null
  price_cents: number
  variant_title: string | null
}

export type ShopifyOrderFetched = {
  shopify_order_id: string
  shopify_order_number: string | null
  name: string | null
  email: string | null
  customer_name: string | null
  financial_status: string | null
  fulfillment_status: string | null
  total_price_cents: number
  currency: string
  line_items: ShopifyOrderLine[]
  ordered_at: string | null
  shopify_customer_id: string | null
  raw: unknown
}

/** Haal recente orders op (paginated, max pages). */
export async function fetchRecentShopifyOrders(opts?: {
  limit?: number
  status?: 'any' | 'open' | 'closed' | 'cancelled'
}): Promise<ShopifyOrderFetched[]> {
  const { shop, token, apiVersion } = await getShopifyAdminToken()
  const limit = opts?.limit ?? 50
  const status = opts?.status ?? 'any'

  const url = new URL(
    `https://${shop}/admin/api/${apiVersion}/orders.json`
  )
  url.searchParams.set('status', status)
  url.searchParams.set('limit', String(Math.min(limit, 250)))
  url.searchParams.set(
    'fields',
    'id,name,order_number,email,created_at,financial_status,fulfillment_status,total_price,currency,line_items,customer'
  )

  const res = await fetch(url.toString(), {
    headers: {
      'X-Shopify-Access-Token': token,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Shopify orders ${res.status}: ${t.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    orders?: Array<{
      id: number | string
      name?: string
      order_number?: number
      email?: string | null
      created_at?: string
      financial_status?: string
      fulfillment_status?: string | null
      total_price?: string
      currency?: string
      line_items?: Array<{
        title?: string
        quantity?: number
        sku?: string | null
        price?: string
        variant_title?: string | null
      }>
      customer?: {
        id?: number | string
        first_name?: string
        last_name?: string
        email?: string
      } | null
    }>
  }

  return (json.orders ?? []).map((o) => {
    const first = o.customer?.first_name || ''
    const last = o.customer?.last_name || ''
    const customerName = [first, last].filter(Boolean).join(' ') || null
    const total = Math.round(parseFloat(o.total_price || '0') * 100)
    return {
      shopify_order_id: String(o.id),
      shopify_order_number: o.order_number != null ? String(o.order_number) : null,
      name: o.name || null,
      email: o.email || o.customer?.email || null,
      customer_name: customerName,
      financial_status: o.financial_status || null,
      fulfillment_status: o.fulfillment_status || null,
      total_price_cents: Number.isFinite(total) ? total : 0,
      currency: o.currency || 'EUR',
      line_items: (o.line_items ?? []).map((li) => ({
        title: li.title || 'Artikel',
        quantity: li.quantity ?? 1,
        sku: li.sku ?? null,
        price_cents: Math.round(parseFloat(li.price || '0') * 100),
        variant_title: li.variant_title ?? null,
      })),
      ordered_at: o.created_at || null,
      shopify_customer_id: o.customer?.id != null ? String(o.customer.id) : null,
      raw: o,
    }
  })
}
