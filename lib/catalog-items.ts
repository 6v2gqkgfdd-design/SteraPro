/**
 * Gedeelde catalogus-laadlogica (productgroep 275 = combinaties + moswanden).
 *
 * Wordt gebruikt door:
 *  - de klant-catalogus (/catalog) — ZONDER inkoopprijs
 *  - de offerte-builder als kies-venster — MET inkoopprijs (withCost),
 *    zodat de verkoopprijs als inkoop × marge berekend kan worden.
 *
 * Eén bron van waarheid voor de afgeleide velden (substraat, licht,
 * binnen/buiten, merk, vorm, ...).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type CatalogItem = {
  itemcode: string
  description: string
  hasImage: boolean
  salePrice: number
  /** Alleen ingevuld wanneer withCost = true (offerte-builder, intern). */
  costPrice?: number | null
  height: number | null
  diameter: number | null
  diameterCulturePot: number | null
  itemVariety: string | null
  plantsoort: string
  merk: string
  /** Pot-merk uit de Brand-tag (huisstijl). */
  brand: string | null
  /** Collectie/serie van de pot (Collection-tag), bv. Atlas, Seren. */
  collection: string | null
  shape: 'Rond' | 'Hoekig' | 'Overig'
  substrate: string | null
  locations: string[]
  lightLux: number | null
  tempMin: number | null
  stockAvailable: number
  isMos: boolean
  frameMateriaal: string
  mostype: string
  moskleur: string
}

const GROUP_CODE = '275'
const MOS_WORDS = ['bolmos', 'platmos', 'rendiermos', 'bol- en']

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

type ViewRow = {
  itemcode: string
  description: string | null
  item_picture_name: string | null
  suggested_sale_price: number | null
  cost_price?: number | null
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
  length: number | null
  tags: unknown
}
type StockRow = { itemcode: string; stock_available: number | null }

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  selectStr: string,
  filter: 'group275' | 'none'
): Promise<T[]> {
  const pageSize = 1000
  let from = 0
  const all: T[] = []
  while (true) {
    let q = supabase.from(table).select(selectStr)
    if (filter === 'group275') q = q.eq('product_group_code', GROUP_CODE)
    const res = (await q.range(from, from + pageSize - 1)) as {
      data: T[] | null
      error: unknown
    }
    if (res.error) break
    const batch = res.data ?? []
    all.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
    if (from > 20000) break
  }
  return all
}

/**
 * Laadt alle combinaties/moswanden (groep 275) met afgeleide velden.
 * withCost = true voegt de inkoopprijs toe (enkel voor interne schermen).
 */
export async function loadCatalogItems(
  supabase: SupabaseClient,
  opts: { withCost?: boolean } = {}
): Promise<CatalogItem[]> {
  const withCost = opts.withCost === true
  const viewSelect =
    'itemcode, description, item_picture_name, suggested_sale_price, product_group_code, height, diameter, diameter_culture_pot, pot_size, location_icon_nl' +
    (withCost ? ', cost_price' : '')

  const [viewRows, nkRows, stockRows] = await Promise.all([
    fetchAll<ViewRow>(supabase, 'v_nieuwkoop_with_margin', viewSelect, 'group275'),
    fetchAll<NkRow>(
      supabase,
      'nieuwkoop_products',
      'itemcode, item_variety_nl, has_image, length, tags',
      'group275'
    ),
    fetchAll<StockRow>(supabase, 'nieuwkoop_stock', 'itemcode, stock_available', 'none'),
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
      costPrice: withCost ? (row.cost_price ?? null) : null,
      height: row.height,
      diameter: row.diameter,
      diameterCulturePot: row.diameter_culture_pot,
      itemVariety: variety,
      plantsoort: extractPlantsoort(plantPart),
      merk: extractMerk(potPart),
      brand: tagVals(nk?.tags, 'Brand')[0] ?? null,
      collection: tagVals(nk?.tags, 'Collection')[0] ?? null,
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
  return items
}
