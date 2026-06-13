import { NextResponse } from 'next/server'

// Publieke route: zet de samengestelde planten in het Shopify-winkelmandje.
// Resolvet per producthandle de eerste variant-ID via de Shopify Admin API
// (zelfde client_credentials-flow als /api/shopify/sync) en bouwt een
// cart-permalink op het publieke webshopdomein. De gekozen pot gaat mee als
// cart-attribuut. Geen login nodig; we lekken niets gevoeligs (variant-ID's
// en cart-URL's zijn sowieso publiek op de storefront).

export const runtime = 'nodejs'

const PUBLIC_SHOP = (process.env.NEXT_PUBLIC_SHOP_DOMAIN || 'sterapro.be')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '')

type Item = { handle?: string; qty?: number }

export async function POST(req: Request) {
  let body: { items?: Item[]; pot?: { lijn?: string; kleur?: string } | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const items = Array.isArray(body?.items) ? body.items.slice(0, 12) : []
  const pot = body?.pot && typeof body.pot === 'object' ? body.pot : null
  if (!items.length) {
    return NextResponse.json({ error: 'Geen planten geselecteerd.' }, { status: 400 })
  }

  const SHOP = process.env.SHOPIFY_STORE_DOMAIN
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET
  const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04'
  if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'De webshop-koppeling is niet geconfigureerd op de server.' },
      { status: 500 },
    )
  }

  // 1) Token via client_credentials.
  let token = ''
  try {
    const tokRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    })
    const tok = await tokRes.json().catch(() => ({}))
    if (!tokRes.ok || !tok?.access_token) {
      return NextResponse.json({ error: 'Kon geen verbinding maken met de webshop.' }, { status: 502 })
    }
    token = tok.access_token
  } catch {
    return NextResponse.json({ error: 'Kon geen verbinding maken met de webshop.' }, { status: 502 })
  }

  async function gql(query: string, variables: Record<string, unknown>) {
    const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    })
    const j = await res.json()
    if (j.errors) throw new Error(JSON.stringify(j.errors))
    return j.data
  }

  // 2) Per handle de eerste (goedkoopste/standaard) variant resolven.
  const VARIANT_Q = `query($q:String!){ products(first:1, query:$q){ nodes { variants(first:1){ nodes { id } } } } }`
  const parts: string[] = []
  const missing: string[] = []
  for (const it of items) {
    const handle = String(it?.handle || '').trim()
    const qty = Math.max(1, Math.min(99, Number(it?.qty) || 1))
    if (!handle) continue
    try {
      const d = await gql(VARIANT_Q, { q: `handle:${handle}` })
      const gid: string | undefined = d?.products?.nodes?.[0]?.variants?.nodes?.[0]?.id
      const num = gid ? gid.split('/').pop() : null
      if (num) parts.push(`${num}:${qty}`)
      else missing.push(handle)
    } catch {
      missing.push(handle)
    }
  }

  if (!parts.length) {
    return NextResponse.json(
      { error: 'Deze planten staan nog niet in de webshop. Vraag een offerte aan en we zetten ze klaar.', missing },
      { status: 422 },
    )
  }

  // 3) Cart-permalink bouwen op het publieke webshopdomein. De gekozen pot als
  //    cart-attribuut (brackets bewust niet ge-encodeerd — Shopify-formaat).
  let url = `https://${PUBLIC_SHOP}/cart/${parts.join(',')}`
  const attrs: string[] = []
  if (pot?.lijn) attrs.push(`attributes[Pot-lijn]=${encodeURIComponent(String(pot.lijn))}`)
  if (pot?.kleur) attrs.push(`attributes[Pot-kleur]=${encodeURIComponent(String(pot.kleur))}`)
  attrs.push(`attributes[Samengesteld via]=${encodeURIComponent('Plantconfigurator')}`)
  url += `?${attrs.join('&')}`

  return NextResponse.json({ url, missing })
}
