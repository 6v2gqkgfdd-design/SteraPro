/**
 * Dagelijkse stats-sync naar de Shopify-webshop (Vercel Cron).
 *
 * Telt het aantal locaties in onderhoud in Supabase en schrijft dat als
 * shop-metafield `stera.locaties_onderhoud`. De homepage-sectie
 * "Stera realisaties" in het thema leest die metafield, zodat het cijfer
 * "locaties in onderhoud" automatisch meeloopt met de app.
 *
 * Beveiliging: zelfde patroon als sync-stock (Bearer CRON_SECRET).
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const SHOP = process.env.SHOPIFY_STORE_DOMAIN
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET
  if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ ok: false, error: 'Shopify-env ontbreekt' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { count, error } = await supabase
    .from('locations')
    .select('id', { count: 'exact', head: true })
  if (error || count == null) {
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 })
  }

  const tokRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  const tok = (await tokRes.json()) as { access_token?: string }
  if (!tok.access_token) {
    return NextResponse.json({ ok: false, error: 'Shopify-token mislukt' }, { status: 502 })
  }

  const gql = async (query: string, variables: unknown) => {
    const r = await fetch(`https://${SHOP}/admin/api/2026-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': tok.access_token!,
      },
      body: JSON.stringify({ query, variables }),
    })
    return r.json()
  }

  const shopData = (await gql('query { shop { id } }', {})) as {
    data?: { shop?: { id?: string } }
  }
  const shopId = shopData.data?.shop?.id
  if (!shopId) {
    return NextResponse.json({ ok: false, error: 'Shop-id niet gevonden' }, { status: 502 })
  }

  const res = (await gql(
    `mutation ms($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key value }
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: 'stera',
          key: 'locaties_onderhoud',
          type: 'single_line_text_field',
          value: String(count),
        },
      ],
    }
  )) as { data?: { metafieldsSet?: { userErrors?: unknown[] } } }

  const errs = res.data?.metafieldsSet?.userErrors ?? []
  return NextResponse.json({ ok: errs.length === 0, locaties: count, errors: errs })
}
