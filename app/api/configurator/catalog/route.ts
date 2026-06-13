import { NextResponse } from 'next/server'

// Publieke catalogus voor de plantconfigurator: leest het LIVE assortiment uit
// de webshop (sterapro.be/products.json — publiek, geen auth) en groepeert het
// per plant met de echte situatie-tags (licht/grootte/buiten/hydro) en de
// beschikbare potten + variant-ID's voor het winkelmandje. Server-side, dus
// geen CORS-gedoe; resultaat wordt 10 min gecacht.

export const runtime = 'nodejs'
export const revalidate = 600

const SHOP_PUBLIC = (process.env.NEXT_PUBLIC_SHOP_DOMAIN || 'sterapro.be')
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

export async function GET() {
  type ShopVariant = { id?: number | string; available?: boolean }
  type ShopImage = { src?: string }
  type ShopProduct = { title?: string; handle?: string; tags?: string[]; variants?: ShopVariant[]; images?: ShopImage[] }

  const all: ShopProduct[] = []
  try {
    for (let page = 1; page <= 12; page++) {
      const r = await fetch(`https://${SHOP_PUBLIC}/products.json?limit=250&page=${page}`, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 600 },
      })
      if (!r.ok) break
      const j = await r.json()
      const ps: ShopProduct[] = Array.isArray(j?.products) ? j.products : []
      all.push(...ps)
      if (ps.length < 250) break
    }
  } catch {
    return NextResponse.json({ error: 'Kon het assortiment niet laden.', plants: [] }, { status: 502 })
  }

  const byPlant = new Map<string, Plant>()
  for (const p of all) {
    const title = String(p?.title || '').trim()
    if (!title) continue
    const idx = title.search(/ in /i)
    const plant = (idx > 0 ? title.slice(0, idx) : title).trim()
    const pot = (idx > 0 ? title.slice(idx + 4) : '').trim() || 'Standaard'
    const tags = Array.isArray(p?.tags) ? p.tags : []
    const variant = (p?.variants || [])[0] || {}
    const variantId = variant?.id != null ? String(variant.id) : ''
    const image = (p?.images || [])[0]?.src || null

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
      e.pots.push({ pot, handle: String(p.handle), variantId, available: variant?.available !== false })
    }
  }

  // Alleen planten met minstens één bestelbare pot; potten alfabetisch.
  const plants = [...byPlant.values()]
    .filter((e) => e.pots.length > 0)
    .map((e) => ({ ...e, pots: e.pots.sort((a, b) => a.pot.localeCompare(b.pot)) }))
    .sort((a, b) => a.plant.localeCompare(b.plant))

  return NextResponse.json(
    { plants, count: plants.length, shop: SHOP_PUBLIC },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  )
}
