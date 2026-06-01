/**
 * Stera Pro — Catalogus (server)
 *
 * Haalt productgroep 275 (combinaties + moswanden) één keer op, verrijkt
 * elk item met afgeleide velden, en geeft de compacte lijst door aan
 * CatalogClient — die filtert/pagineert volledig in de browser (instant).
 *
 * BELANGRIJK: inkoopprijs/marge worden hier NIET opgehaald — de catalogus
 * is klant-zichtbaar.
 */

import { createClient } from '@supabase/supabase-js'
import ScrollRestorer from './ScrollRestorer'
import CatalogClient, {
  type CatalogItem,
  type CatalogInitial,
} from './CatalogClient'

export const dynamic = 'force-dynamic'

const GROUP_CODE = '275'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

// --- Afgeleide velden ----------------------------------------------

function splitDescription(desc: string): { plantPart: string; potPart: string } {
  const lower = desc.toLowerCase()
  const idx = lower.indexOf(' in ')
  if (idx <= 0) return { plantPart: desc, potPart: '' }
  return { plantPart: desc.slice(0, idx).trim(), potPart: desc.slice(idx + 4).trim() }
}
function extractPlantsoort(plantPart: string): string {
  const first = plantPart.split(/[\s'",]+/).filter(Boolean)[0] ?? ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}
function extractMerk(potPart: string): string {
  return potPart.split(/\s+/).filter(Boolean)[0] ?? ''
}
function detectShape(diameter: number | null, length: number | null): 'Rond' | 'Hoekig' | 'Overig' {
  const d = Number(diameter ?? 0)
  const len = Number(length ?? 0)
  if (d > 0 && len <= 0) return 'Rond'
  if (len > 0 && d <= 0) return 'Hoekig'
  return 'Overig'
}

const MOS_WORDS = ['bolmos', 'platmos', 'rendiermos', 'bol- en']
function isMosmuur(variety: string | null | undefined): boolean {
  if (!variety) return false
  const v = variety.toLowerCase()
  return MOS_WORDS.some((w) => v.includes(w))
}
function extractFrameMateriaal(variety: string | null): 'Aluminium' | 'MDF' | 'Nova Frame' | 'Overig' {
  if (!variety) return 'Overig'
  const v = variety.toLowerCase()
  if (v.startsWith('aluminium')) return 'Aluminium'
  if (v.startsWith('mdf')) return 'MDF'
  if (v.startsWith('nova frame')) return 'Nova Frame'
  return 'Overig'
}
function extractMostype(variety: string | null): 'Bolmos' | 'Platmos' | 'Rendiermos' | 'Mix' | 'Overig' {
  if (!variety) return 'Overig'
  const v = variety.toLowerCase()
  if (v.includes('bol- en') || (v.includes('bolmos') && v.includes('rendiermos'))) return 'Mix'
  if (v.includes('rendiermos')) return 'Rendiermos'
  if (v.includes('platmos')) return 'Platmos'
  if (v.includes('bolmos')) return 'Bolmos'
  return 'Overig'
}
function extractMoskleur(variety: string | null): string {
  if (!variety) return ''
  const m = variety.match(/\(([^()]+)\)\s*$/)
  if (!m) return ''
  return m[1].replace(/\s+/g, ' ').trim().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

type TagEntry = { Code?: string | null; Values?: Array<{ Description_NL?: string | null }> | null }
function tagVals(tags: unknown, code: string): string[] {
  if (!Array.isArray(tags)) return []
  const t = (tags as TagEntry[]).find((x) => x?.Code === code)
  return (t?.Values ?? []).map((v) => (v?.Description_NL ?? '').trim()).filter(Boolean)
}
function firstNum(vals: string[]): number | null {
  for (const v of vals) {
    const n = Number(String(v).replace(/[^\d.-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

function parseArray(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams

  type ViewRow = {
    itemcode: string
    description: string | null
    item_picture_name: string | null
    suggested_sale_price: number | null
    product_group_code: string
    height: number | null
    diameter: number | null
    diameter_culture_pot: number | null
    pot_size: string | null
    location_icon_nl: string | null
  }
  type NkRow = {
    itemcode: string
    item_variety_nl: string | null
    has_image: boolean | null
    width: number | null
    depth: number | null
    length: number | null
    tags: unknown
  }
  type StockRow = { itemcode: string; stock_available: number | null }

  async function fetchAll<T>(
    table: string,
    selectStr: string,
    apply: (q: ReturnType<ReturnType<typeof supabase.from>['select']>) => ReturnType<ReturnType<typeof supabase.from>['select']>
  ): Promise<T[]> {
    const pageSize = 1000
    let from = 0
    const all: T[] = []
    while (true) {
      const q = apply(supabase.from(table).select(selectStr)).range(from, from + pageSize - 1)
      const res = (await q) as { data: T[] | null; error: unknown }
      if (res.error) break
      const batch = res.data ?? []
      all.push(...batch)
      if (batch.length < pageSize) break
      from += pageSize
      if (from > 20000) break
    }
    return all
  }

  const [viewRows, nkRows, stockRows] = await Promise.all([
    fetchAll<ViewRow>(
      'v_nieuwkoop_with_margin',
      'itemcode, description, item_picture_name, suggested_sale_price, product_group_code, height, diameter, diameter_culture_pot, pot_size, location_icon_nl',
      (q) => q.eq('product_group_code', GROUP_CODE).not('item_picture_name', 'is', null).neq('item_picture_name', '').order('description')
    ),
    fetchAll<NkRow>(
      'nieuwkoop_products',
      'itemcode, item_variety_nl, has_image, width, depth, length, tags',
      (q) => q.eq('product_group_code', GROUP_CODE)
    ),
    fetchAll<StockRow>('nieuwkoop_stock', 'itemcode, stock_available', (q) => q),
  ])

  const nkByCode = new Map<string, NkRow>()
  for (const r of nkRows) if (r.itemcode) nkByCode.set(r.itemcode, r)
  const stockByCode = new Map<string, number>()
  for (const s of stockRows) if (s.itemcode) stockByCode.set(s.itemcode, Number(s.stock_available ?? 0))

  const items: CatalogItem[] = []
  for (const row of viewRows) {
    if (!row.item_picture_name || String(row.item_picture_name).trim() === '') continue
    const nk = nkByCode.get(row.itemcode)
    const hasImage = !nk || nk.has_image !== false
    const variety = nk?.item_variety_nl ?? null
    const { plantPart, potPart } = splitDescription(row.description || '')
    items.push({
      itemcode: row.itemcode,
      description: row.description || row.itemcode,
      hasImage,
      salePrice: Number(row.suggested_sale_price ?? 0),
      height: row.height,
      diameter: row.diameter,
      diameterCulturePot: row.diameter_culture_pot,
      itemVariety: variety,
      plantsoort: extractPlantsoort(plantPart),
      merk: extractMerk(potPart),
      shape: detectShape(row.diameter, nk?.length ?? null),
      substrate: tagVals(nk?.tags, 'SubstrateType')[0] ?? null,
      locations: tagVals(nk?.tags, 'Location'),
      lightLux: firstNum(tagVals(nk?.tags, 'LocationLight')),
      tempMin: firstNum(tagVals(nk?.tags, 'Temperature')),
      stockAvailable: stockByCode.get(row.itemcode) ?? 0,
      isMos: isMosmuur(variety),
      frameMateriaal: extractFrameMateriaal(variety),
      mostype: extractMostype(variety),
      moskleur: extractMoskleur(variety),
    })
  }

  const initial: CatalogInitial = {
    tab: params.tab === 'moswanden' ? 'moswanden' : 'combinaties',
    q: typeof params.q === 'string' ? params.q : '',
    inStock: params.inStock === '0' ? false : true,
    height: typeof params.height === 'string' ? params.height : '',
    diameter: typeof params.diameter === 'string' ? params.diameter : '',
    substraten: parseArray(params.substraat),
    locaties: parseArray(params.locatie),
    lichten: parseArray(params.licht),
    systems: parseArray(params.system),
    shapes: parseArray(params.shape),
    plantsoorten: parseArray(params.plantsoort),
    merken: parseArray(params.merk),
    frames: parseArray(params.frame),
    mostypes: parseArray(params.mostype),
    moskleuren: parseArray(params.moskleur),
  }

  return (
    <>
      <ScrollRestorer />
      <CatalogClient items={items} initial={initial} />
    </>
  )
}
