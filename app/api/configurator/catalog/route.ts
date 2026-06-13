import { NextResponse } from 'next/server'

// Publieke catalogus voor de plantconfigurator: leest het live assortiment via
// de Shopify Admin API (client_credentials, zelfde flow als /api/shopify/sync)
// en groepeert het per plant met de echte situatie-tags (licht/grootte/buiten/
// hydro) + de beschikbare potten en variant-ID's voor het winkelmandje.

export const runtime = 'nodejs'
export const revalidate = 300

const PUBLIC_SHOP = (process.env.NEXT_PUBLIC_SHOP_DOMAIN || 'sterapro.be')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '')

const LIGHT_TAGS = ['Veel licht', 'Gemiddeld licht', 'Weinig licht']
const SIZE_TAGS = [
  'Compact (tot 60 cm)',
  'Middelgroot (60-120 cm)',
  'Groot (120-180 cm)',
  'Extra groot (180+ cm)',
]

type Pot = { pot: string; handle: string; variantId: string; available: boolean }
type Plant = {
  plant: string
  light: string[]
  sizes: string[]
  outdoor: boolean
  hydro: boolean
  image: string | null
  pots: Pot[]
}

type ProductNode = {
  title?: string
  handle?: string
  tags?: string[]
  featuredImage?: { url?: string } | null
  variants?: { nodes?: { id?: string; availableForSale?: boolean }[] }
}

type Debug = {
  tokenOk: boolean
  version: string
  pages: number
  raw: number
  gqlError: string | null
  tokenError?: string
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function GET() {
  const SHOP = process.env.SHOPIFY_STORE_DOMAIN
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET
  const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04'
  const debug: Debug = { tokenOk: false, version: API_VERSION, pages: 0, raw: 0, gqlError: null }
  const noStore = { 'Cache-Control': 'no-store' }

  if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'Webshop-koppeling ontbreekt op de server.', plants: [], count: 0, _debug: debug }, { status: 500, headers: noStore })
  }

  // 1) Token via client_credentials.
  let token = ''
  try {
    const tr = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
    })
    const j = await tr.json().catch(() => ({}))
    if (!tr.ok || !j?.access_token) {
      debug.tokenError = `status ${tr.status}`
      return NextResponse.json({ error: 'Geen verbinding met de webshop.', plants: [], count: 0, _debug: debug }, { status: 502, headers: noStore })
    }
    token = j.access_token
    debug.tokenOk = true
  } catch (e) {
    debug.tokenError = errMsg(e)
    return NextResponse.json({ error: 'Geen verbinding met de webshop.', plants: [], count: 0, _debug: debug }, { status: 502, headers: noStore })
  }

  // 2) Alle actieve producten ophalen (gepagineerd).
  const QUERY = `query($cursor: String) {
    products(first: 200, after: $cursor, query: "status:active") {
      nodes { title handle tags featuredImage { url } variants(first: 1) { nodes { id availableForSale } } }
      pageInfo { hasNextPage endCursor }
    }
  }`

  const all: ProductNode[] = []
  let cursor: string | null = null
  for (let i = 0; i < 20; i++) {
    let j: { errors?: unknown; data?: { products?: { nodes?: ProductNode[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } } }
    try {
      const r = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query: QUERY, variables: { cursor } }),
      })
      j = await r.json()
    } catch (e) {
      debug.gqlError = 'fetch: ' + errMsg(e)
      break
    }
    if (j?.errors) {
      debug.gqlError = JSON.stringify(j.errors).slice(0, 400)
      break
    }
    const conn = j?.data?.products
    const nodes: ProductNode[] = conn?.nodes || []
    all.push(...nodes)
    debug.pages++
    if (!conn?.pageInfo?.hasNextPage) break
    cursor = conn.pageInfo.endCursor || null
  }
  debug.raw = all.length

  // 3) Groeperen per plant (titel = "Plant in Pot").
  const byPlant = new Map<string, Plant>()
  for (const p of all) {
    const title = String(p?.title || '').trim()
    if (!title) continue
    const idx = title.search(/ in /i)
    const plant = (idx > 0 ? title.slice(0, idx) : title).trim()
    const pot = (idx > 0 ? title.slice(idx + 4) : '').trim() || 'Standaard'
    const tags = Array.isArray(p?.tags) ? p.tags : []
    const variant = p?.variants?.nodes?.[0]
    const variantId = variant?.id ? String(variant.id).split('/').pop() || '' : ''
    const image = p?.featuredImage?.url || null

    if (!byPlant.has(plant)) {
      byPlant.set(plant, { plant, light: [], sizes: [], outdoor: false, hydro: false, image, pots: [] })
    }
    const e = byPlant.get(plant)!
    for (const t of LIGHT_TAGS) if (tags.includes(t) && !e.light.includes(t)) e.light.push(t)
    for (const s of SIZE_TAGS) if (tags.includes(s) && !e.sizes.includes(s)) e.sizes.push(s)
    if (tags.includes('Ook voor buiten')) e.outdoor = true
    if (tags.includes('Hydrocultuur')) e.hydro = true
    if (!e.image && image) e.image = image
    if (p?.handle && variantId) {
      e.pots.push({ pot, handle: String(p.handle), variantId, available: variant?.availableForSale !== false })
    }
  }

  const plants = [...byPlant.values()]
    .filter((e) => e.pots.length > 0)
    .map((e) => ({ ...e, pots: e.pots.sort((a, b) => a.pot.localeCompare(b.pot)) }))
    .sort((a, b) => a.plant.localeCompare(b.plant))

  return NextResponse.json({ plants, count: plants.length, shop: PUBLIC_SHOP, _debug: debug }, { headers: noStore })
}
