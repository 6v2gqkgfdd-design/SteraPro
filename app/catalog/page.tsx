/**
 * Stera Pro — Catalogus pagina
 *
 * Toont productgroep 275 "All-in-1 concepts" verdeeld over twee tabs:
 *   - Combinaties: plant + pot voorgekweekt met watermeter
 *   - Mosmuren: aluminium/MDF/Nova frames met bol/plat/rendiermos
 *
 * Het onderscheid wordt afgeleid uit item_variety_nl (mos-woord =
 * mosmuur, anders combinatie).
 *
 * Filters op de combinaties-tab:
 *  - Vrij zoeken, voorraad, hoogte, diameter, lichtbehoefte
 *  - Pot-vorm (iconen-rij), beplantingssysteem, plantsoort, pot-merk
 *
 * Filters op de mosmuren-tab:
 *  - Vrij zoeken, voorraad, hoogte, breedte
 *  - Frame-materiaal (Aluminium / MDF / Nova Frame)
 *  - Mostype (Bolmos / Platmos / Rendiermos / Mix)
 *  - Moskleur (Naturel / Oudgroen / Grasgroen / Lentegroen / ...)
 */

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import AutoSubmitForm from '@/components/auto-submit-form'
import ScrollRestorer from './ScrollRestorer'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 48
const GROUP_CODE = '275'

const HEIGHT_BUCKETS: Record<
  string,
  { min?: number; max?: number; label: string }
> = {
  '0-50': { max: 50, label: 'Tot 50 cm' },
  '50-100': { min: 50, max: 100, label: '50 – 100 cm' },
  '100-150': { min: 100, max: 150, label: '100 – 150 cm' },
  '150-200': { min: 150, max: 200, label: '150 – 200 cm' },
  '200+': { min: 200, label: '200 cm en hoger' },
}

// --- Pot-vorm-detectie ----------------------------------------------
//
// De leverancier-API heeft geen vorm-veld, alleen afmetingen. We
// hebben dus maar één betrouwbaar signaal: heeft de pot een diameter
// of een length? Daarom houden we het simpel: Rond of Hoekig.
//
//   - diameter > 0 (en geen length)   → Rond
//   - length > 0 (en geen diameter)   → Hoekig
//   - alles erbuiten                  → Overig
//
// Subcategorieën (globe/cilinder/cube/rectangle/...) verschillen per
// modellijn van de fabrikant en kunnen we niet automatisch afleiden
// zonder een manuele mapping per modelnaam.

const SHAPES = ['Rond', 'Hoekig', 'Overig'] as const
type Shape = (typeof SHAPES)[number]

function detectShape(dims: {
  diameter: number | null
  length: number | null
}): Shape {
  const d = Number(dims.diameter ?? 0)
  const len = Number(dims.length ?? 0)
  if (d > 0 && len <= 0) return 'Rond'
  if (len > 0 && d <= 0) return 'Hoekig'
  // Rare gevallen (beide of geen van beide ingevuld): de afbeelding
  // toont de gebruiker zelf wel wat het is.
  return 'Overig'
}

// --- Description-parsing -------------------------------------------

function splitDescription(desc: string): {
  plantPart: string
  potPart: string
} {
  // "Aglaonema 'Chantal' in Baq Algar" → plant "Aglaonema 'Chantal'",
  // pot "Baq Algar". Splitst op " in " (eerste voorkomen).
  const lower = desc.toLowerCase()
  const idx = lower.indexOf(' in ')
  if (idx <= 0) return { plantPart: desc, potPart: '' }
  return {
    plantPart: desc.slice(0, idx).trim(),
    potPart: desc.slice(idx + 4).trim(),
  }
}

function extractPlantsoort(plantPart: string): string {
  // Eerste woord, gestript van apostrofes/komma's. "Aglaonema 'Chantal'"
  // → "Aglaonema". "Ficus lyrata 'Bambino'" → "Ficus".
  const first = plantPart.split(/[\s'",]+/).filter(Boolean)[0] ?? ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function extractMerk(potPart: string): string {
  // Eerste woord van de pot-naam. "Baq Luxe Lite Universe Waterfall"
  // → "Baq". "Pottery Pots Rough" → "Pottery". Twee-woord-merken
  // (Pottery Pots, Luca Lifestyle, Ter Steege, ...) gewoon eerste woord;
  // dat is goed genoeg om te groeperen.
  const first = potPart.split(/\s+/).filter(Boolean)[0] ?? ''
  return first
}

// --- Mosmuur-detectie ----------------------------------------------
// Mosmuren in groep 275 worden herkend aan een mos-woord in
// item_variety_nl ("Bolmos", "Platmos", "Rendiermos") of aan een
// frame-materiaalwoord ("Aluminium", "MDF RAL", "Nova Frame").

const MOS_WORDS = ['bolmos', 'platmos', 'rendiermos', 'bol- en']

function isMosmuur(variety: string | null | undefined): boolean {
  if (!variety) return false
  const v = variety.toLowerCase()
  return MOS_WORDS.some((w) => v.includes(w))
}

type FrameMateriaal = 'Aluminium' | 'MDF' | 'Nova Frame' | 'Overig'

function extractFrameMateriaal(variety: string | null): FrameMateriaal {
  if (!variety) return 'Overig'
  const v = variety.toLowerCase()
  if (v.startsWith('aluminium')) return 'Aluminium'
  if (v.startsWith('mdf')) return 'MDF'
  if (v.startsWith('nova frame')) return 'Nova Frame'
  return 'Overig'
}

type Mostype = 'Bolmos' | 'Platmos' | 'Rendiermos' | 'Mix' | 'Overig'

function extractMostype(variety: string | null): Mostype {
  if (!variety) return 'Overig'
  const v = variety.toLowerCase()
  // Mix-varianten ("30% Bol- en 70% Platmos", "30% Bolmos 70% Rendiermos")
  if (v.includes('bol- en') || (v.includes('bolmos') && v.includes('rendiermos'))) {
    return 'Mix'
  }
  if (v.includes('rendiermos')) return 'Rendiermos'
  if (v.includes('platmos')) return 'Platmos'
  if (v.includes('bolmos')) return 'Bolmos'
  return 'Overig'
}

function extractMoskleur(variety: string | null): string {
  if (!variety) return ''
  // Kleur staat tussen haakjes op het einde: "(Naturel)", "(Oudgroen)",
  // "(Licht Grasgroen)", "(Mos groen)" — we nemen alles in de laatste
  // haakjes-groep, en normaliseren spaties.
  const m = variety.match(/\(([^()]+)\)\s*$/)
  if (!m) return ''
  return m[1]
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// --- SVG icoontjes -------------------------------------------------

// Pot-vorm iconen — eenvoudige geometrische schetsen.
function ShapeIcon({ name }: { name: Shape }) {
  const p = {
    width: 28,
    height: 28,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'Rond':
      return (
        <svg {...p}>
          <circle cx="16" cy="16" r="10" />
        </svg>
      )
    case 'Hoekig':
      return (
        <svg {...p}>
          <rect x="6" y="6" width="20" height="20" rx="1.5" />
        </svg>
      )
    case 'Overig':
      return (
        <svg {...p}>
          <circle cx="9" cy="17" r="2" />
          <circle cx="16" cy="17" r="2" />
          <circle cx="23" cy="17" r="2" />
        </svg>
      )
  }
}

// --- Supabase client ------------------------------------------------

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

// --- Types ----------------------------------------------------------

type Product = {
  itemcode: string
  description: string
  item_picture_name: string | null
  cost_price: number
  effective_margin_factor: number
  suggested_sale_price: number
  product_group_code: string
  height: number | null
  diameter: number | null
  diameter_culture_pot: number | null
  pot_size: string | null
  location_icon_nl: string | null
  item_variety_nl: string | null
  is_stock_item: boolean | null
  width: number | null
  depth: number | null
  length: number | null
  substrate: string | null
  locations: string[]
  lightLux: number | null
  tempMin: number | null
  stockAvailable: number
}

type Enriched = Product & {
  plantsoort: string
  merk: string
  shape: Shape
  frameMateriaal: FrameMateriaal
  mostype: Mostype
  moskleur: string
  isMos: boolean
}

type Tab = 'combinaties' | 'moswanden'

// --- Helpers --------------------------------------------------------

function generateSteraName(p: Product): string {
  let name = p.description || p.itemcode
  const bits: string[] = []
  if (p.height && Number(p.height) > 0) {
    bits.push(`H${Math.round(Number(p.height))}cm`)
  }
  if (p.diameter && Number(p.diameter) > 0) {
    bits.push(`Ø${Math.round(Number(p.diameter))}cm`)
  }
  if (bits.length > 0) name += `, ${bits.join(' · ')}`
  return name
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n)
}

function parseArray(v: string | string[] | undefined): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [v]
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const m = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

// --- Tag-helpers (substraat, locatie, licht, temperatuur) -----------
// De Nieuwkoop-tags zitten als jsonb in nieuwkoop_products.tags:
//   [{ Code: "SubstrateType", Values: [{ Description_NL: "Grond" }] }, ...]

type TagValue = { Description_NL?: string | null }
type TagEntry = { Code?: string | null; Values?: TagValue[] | null }

function tagVals(tags: TagEntry[] | null | undefined, code: string): string[] {
  if (!Array.isArray(tags)) return []
  const t = tags.find((x) => x?.Code === code)
  return (t?.Values ?? [])
    .map((v) => (v?.Description_NL ?? '').trim())
    .filter(Boolean)
}

function firstNum(vals: string[]): number | null {
  for (const v of vals) {
    const n = Number(String(v).replace(/[^\d.-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

// Lux-waarden van LocationLight → leesbaar label.
const LIGHT_LABELS: Record<string, string> = {
  '500': 'Weinig licht (500 lux)',
  '750': 'Halfschaduw (750 lux)',
  '1000': 'Veel licht (1000 lux)',
  '1500': 'Vol zon (1500 lux)',
}
function lightLabel(lux: number | null): string {
  if (lux == null) return ''
  return LIGHT_LABELS[String(lux)] ?? `${lux} lux`
}

// --- Page -----------------------------------------------------------

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const tab: Tab =
    params.tab === 'moswanden' ? 'moswanden' : 'combinaties'
  const q = typeof params.q === 'string' ? params.q.trim() : ''
  const diameter =
    typeof params.diameter === 'string' ? params.diameter : ''
  const height = typeof params.height === 'string' ? params.height : ''
  const heightBucket = HEIGHT_BUCKETS[height] ?? null
  const formSubmitted = typeof params.f === 'string'
  // Standaard NIET filteren op voorraad — momenteel zijn de meeste
  // artikels niet als 'op voorraad' geregistreerd in de sync, dus dat
  // zou de lijst leeg maken. De gebruiker kan zelf aanvinken.
  // Voorraad: standaard AAN (enkel op voorraad), gebaseerd op
  // nieuwkoop_stock.stock_available > 0. Bij een ingediend formulier
  // respecteren we het vinkje (uitgevinkt = geen 'inStock' param).
  const inStock = formSubmitted ? params.inStock === '1' : true
  const systems = parseArray(params.system)
  const shapes = parseArray(params.shape) as Shape[]
  const plantsoorten = parseArray(params.plantsoort)
  const merken = parseArray(params.merk)
  const substraten = parseArray(params.substraat)
  const locaties = parseArray(params.locatie)
  const lichten = parseArray(params.licht)
  // Moswand-specifieke filters
  const frames = parseArray(params.frame) as FrameMateriaal[]
  const mostypes = parseArray(params.mostype) as Mostype[]
  const moskleuren = parseArray(params.moskleur)
  const page = Math.max(1, Number(params.page) || 1)

  // Server-side fetch — alles in groep 275 met een foto. (is_stock_item
  // doen we in-memory zodat de optellingen ook items zonder voorraad
  // mee kunnen tellen wanneer de gebruiker dat vinkje uitzet.)
  // item_variety_nl + width/depth/length zitten (nog) niet in de view —
  // we halen ze apart op uit nieuwkoop_products en mergen op itemcode.
  //
  // Supabase PostgREST capt elke query op 1000 rijen, dus we pagineren
  // beide queries met range() tot we alles binnen hebben.
  async function fetchAll<T>(
    build: () => ReturnType<typeof supabase.from>,
    selectStr: string,
    apply: (
      q: ReturnType<ReturnType<typeof supabase.from>['select']>
    ) => ReturnType<ReturnType<typeof supabase.from>['select']>
  ): Promise<{ data: T[]; error: { message: string } | null }> {
    const pageSize = 1000
    let from = 0
    const all: T[] = []
    while (true) {
      const q = apply(build().select(selectStr)).range(from, from + pageSize - 1)
      const res = (await q) as { data: T[] | null; error: { message: string } | null }
      if (res.error) return { data: all, error: res.error }
      const batch = res.data ?? []
      all.push(...batch)
      if (batch.length < pageSize) break
      from += pageSize
      if (from > 20000) break // veiligheid
    }
    return { data: all, error: null }
  }

  type BaseRow = Omit<Product, 'item_variety_nl' | 'width' | 'depth' | 'length'>
  type NkRow = {
    itemcode: string
    item_variety_nl: string | null
    has_image: boolean | null
    width: number | null
    depth: number | null
    length: number | null
    tags: TagEntry[] | null
  }
  type StockRow = { itemcode: string; stock_available: number | null }

  const [
    { data: rawItems, error },
    { data: nieuwkoopRows, error: nkError },
    { data: stockRows },
  ] = await Promise.all([
    fetchAll<BaseRow>(
      () => supabase.from('v_nieuwkoop_with_margin'),
      // Inkoopprijs/marge bewust NIET ophalen — de catalogus is klant-zichtbaar.
      'itemcode, description, item_picture_name, suggested_sale_price, product_group_code, height, diameter, diameter_culture_pot, pot_size, location_icon_nl, is_stock_item',
      (q) =>
        q
          .eq('product_group_code', GROUP_CODE)
          .not('item_picture_name', 'is', null)
          .neq('item_picture_name', '')
          .order('description')
      // Voorraad-filter doen we in-memory (op nieuwkoop_stock), niet hier.
    ),
    fetchAll<NkRow>(
      () => supabase.from('nieuwkoop_products'),
      'itemcode, item_variety_nl, has_image, width, depth, length, tags',
      (q) => q.eq('product_group_code', GROUP_CODE)
    ),
    fetchAll<StockRow>(
      () => supabase.from('nieuwkoop_stock'),
      'itemcode, stock_available',
      (q) => q
    ),
  ])

  // varietyByCode = beplantingssysteem-info per item.
  // photoFilterActive = de extra query slaagde → we mogen op has_image
  // filteren. Bij een fout (bv. has_image-kolom bestaat nog niet omdat
  // de migratie niet gedraaid is) laten we de foto-filter gewoon weg.
  const varietyByCode = new Map<string, string>()
  const photoOkCodes = new Set<string>()
  const dimsByCode = new Map<
    string,
    {
      width: number | null
      depth: number | null
      length: number | null
    }
  >()
  const tagInfoByCode = new Map<
    string,
    {
      substrate: string | null
      locations: string[]
      lightLux: number | null
      tempMin: number | null
    }
  >()
  if (!nkError && nieuwkoopRows) {
    for (const v of nieuwkoopRows) {
      if (v.itemcode && v.item_variety_nl) {
        varietyByCode.set(v.itemcode, v.item_variety_nl)
      }
      if (v.itemcode && v.has_image !== false) {
        photoOkCodes.add(v.itemcode)
      }
      if (v.itemcode) {
        dimsByCode.set(v.itemcode, {
          width: v.width,
          depth: v.depth,
          length: v.length,
        })
        tagInfoByCode.set(v.itemcode, {
          substrate: tagVals(v.tags, 'SubstrateType')[0] ?? null,
          locations: tagVals(v.tags, 'Location'),
          lightLux: firstNum(tagVals(v.tags, 'LocationLight')),
          tempMin: firstNum(tagVals(v.tags, 'Temperature')),
        })
      }
    }
  }

  // Voorraad per itemcode (uit nieuwkoop_stock).
  const stockByCode = new Map<string, number>()
  if (stockRows) {
    for (const s of stockRows) {
      if (s.itemcode) stockByCode.set(s.itemcode, Number(s.stock_available ?? 0))
    }
  }

  // Foto-filter alleen toepassen als we daadwerkelijk een lijst hebben
  // van OK-items. Zo niet (query faalde, RLS, lege array, ...), tonen
  // we sowieso alles met een ingevulde foto-naam — beter dan een leeg
  // scherm.
  const photoFilterUsable = photoOkCodes.size > 0

  const items = (rawItems ?? [])
    .filter(
      (it) =>
        it.item_picture_name &&
        String(it.item_picture_name).trim() !== '' &&
        (!photoFilterUsable || photoOkCodes.has(it.itemcode))
    )
    .map((it) => {
      const dims = dimsByCode.get(it.itemcode)
      const tagInfo = tagInfoByCode.get(it.itemcode)
      return {
        ...it,
        item_variety_nl: varietyByCode.get(it.itemcode) ?? null,
        width: dims?.width ?? null,
        depth: dims?.depth ?? null,
        length: dims?.length ?? null,
        substrate: tagInfo?.substrate ?? null,
        locations: tagInfo?.locations ?? [],
        lightLux: tagInfo?.lightLux ?? null,
        tempMin: tagInfo?.tempMin ?? null,
        stockAvailable: stockByCode.get(it.itemcode) ?? 0,
      } as Product
    })

  // Verrijk met afgeleide velden.
  const enriched: Enriched[] = items.map((it) => {
    const { plantPart, potPart } = splitDescription(it.description || '')
    const mos = isMosmuur(it.item_variety_nl)
    return {
      ...it,
      plantsoort: extractPlantsoort(plantPart),
      merk: extractMerk(potPart),
      shape: detectShape({ diameter: it.diameter, length: it.length }),
      frameMateriaal: extractFrameMateriaal(it.item_variety_nl),
      mostype: extractMostype(it.item_variety_nl),
      moskleur: extractMoskleur(it.item_variety_nl),
      isMos: mos,
    }
  })

  // Splits op tab — een mosmuur kan nooit ook combinatie zijn.
  const combinaties = enriched.filter((x) => !x.isMos)
  const moswanden = enriched.filter((x) => x.isMos)
  const tabSet = tab === 'moswanden' ? moswanden : combinaties

  // Tellingen per filterblok — op de tab-set vóór de overige filters,
  // zodat de gebruiker steeds ziet hoeveel items er in welke categorie
  // zitten binnen de huidige tab.
  const plantsoortCounts = countBy(combinaties, (x) => x.plantsoort)
  const merkCounts = countBy(combinaties, (x) => x.merk)
  const systeemCounts = countBy(combinaties, (x) => x.item_variety_nl ?? '')
  const shapeCounts = countBy(combinaties, (x) => x.shape)
  const substraatCounts = countBy(combinaties, (x) => x.substrate ?? '')
  const lichtCounts = countBy(combinaties, (x) =>
    x.lightLux != null ? String(x.lightLux) : ''
  )
  const locatieCounts = new Map<string, number>()
  for (const x of combinaties)
    for (const l of x.locations)
      locatieCounts.set(l, (locatieCounts.get(l) ?? 0) + 1)
  const sortedSubstraten = Array.from(substraatCounts.entries())
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
  const sortedLichten = Array.from(lichtCounts.entries())
    .filter(([k]) => k)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
  const frameCounts = countBy(moswanden, (x) => x.frameMateriaal)
  const mostypeCounts = countBy(moswanden, (x) => x.mostype)
  const moskleurCounts = countBy(moswanden, (x) => x.moskleur)

  // In-memory filtering — gemeenschappelijke filters eerst.
  let filtered = tabSet
  if (q) {
    const ql = q.toLowerCase()
    filtered = filtered.filter((x) =>
      (x.description || '').toLowerCase().includes(ql)
    )
  }
  if (heightBucket?.min != null)
    filtered = filtered.filter(
      (x) => (x.height ?? 0) >= (heightBucket.min ?? 0)
    )
  if (heightBucket?.max != null)
    filtered = filtered.filter(
      (x) => (x.height ?? 0) <= (heightBucket.max ?? 0)
    )
  if (inStock) filtered = filtered.filter((x) => (x.stockAvailable ?? 0) > 0)

  // Tab-specifieke filters.
  if (tab === 'combinaties') {
    if (substraten.length > 0)
      filtered = filtered.filter(
        (x) => x.substrate != null && substraten.includes(x.substrate)
      )
    if (locaties.length > 0)
      filtered = filtered.filter((x) =>
        locaties.some((l) => x.locations.includes(l))
      )
    if (lichten.length > 0)
      filtered = filtered.filter(
        (x) => x.lightLux != null && lichten.includes(String(x.lightLux))
      )
    if (diameter)
      filtered = filtered.filter(
        (x) => Math.round(Number(x.diameter)) === Number(diameter)
      )
    if (systems.length > 0)
      filtered = filtered.filter((x) =>
        systems.includes(x.item_variety_nl ?? '')
      )
    if (shapes.length > 0)
      filtered = filtered.filter((x) => shapes.includes(x.shape))
    if (plantsoorten.length > 0)
      filtered = filtered.filter((x) => plantsoorten.includes(x.plantsoort))
    if (merken.length > 0)
      filtered = filtered.filter((x) => merken.includes(x.merk))
  } else {
    if (frames.length > 0)
      filtered = filtered.filter((x) => frames.includes(x.frameMateriaal))
    if (mostypes.length > 0)
      filtered = filtered.filter((x) => mostypes.includes(x.mostype))
    if (moskleuren.length > 0)
      filtered = filtered.filter((x) => moskleuren.includes(x.moskleur))
  }

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  )

  // Beschikbare pot-diameters (alleen relevant op combinaties-tab).
  const allDiameters: number[] = Array.from(
    new Set(
      combinaties
        .map((x) => Math.round(Number(x.diameter)))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ).sort((a, b) => a - b)

  // Top-N kortere lijsten voor de sidebar (anders zijn merken bv. 17).
  const sortedPlantsoorten = Array.from(plantsoortCounts.entries())
    .filter(([k]) => k && k.toLowerCase() !== 'overig')
    .sort((a, b) => b[1] - a[1])
  const sortedMerken = Array.from(merkCounts.entries())
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
  const sortedSystemen = Array.from(systeemCounts.entries())
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
  const sortedFrames = Array.from(frameCounts.entries())
    .filter(([k]) => k && k !== 'Overig')
    .sort((a, b) => b[1] - a[1])
  const sortedMostypes = Array.from(mostypeCounts.entries())
    .filter(([k]) => k && k !== 'Overig')
    .sort((a, b) => b[1] - a[1])
  const sortedMoskleuren = Array.from(moskleurCounts.entries())
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])

  function buildHref(overrides: Record<string, string | number | string[]>) {
    const usp = new URLSearchParams()
    usp.set('f', '1')
    if (tab !== 'combinaties') usp.set('tab', tab)
    if (q) usp.set('q', q)
    if (height) usp.set('height', height)
    if (inStock) usp.set('inStock', '1')
    if (tab === 'combinaties') {
      if (diameter) usp.set('diameter', diameter)
      for (const s of substraten) usp.append('substraat', s)
      for (const s of locaties) usp.append('locatie', s)
      for (const s of lichten) usp.append('licht', s)
      for (const s of systems) usp.append('system', s)
      for (const s of shapes) usp.append('shape', s)
      for (const s of plantsoorten) usp.append('plantsoort', s)
      for (const s of merken) usp.append('merk', s)
    } else {
      for (const s of frames) usp.append('frame', s)
      for (const s of mostypes) usp.append('mostype', s)
      for (const s of moskleuren) usp.append('moskleur', s)
    }
    if (safePage > 1) usp.set('page', String(safePage))
    for (const [k, v] of Object.entries(overrides)) {
      usp.delete(k)
      if (Array.isArray(v)) {
        for (const x of v) usp.append(k, String(x))
      } else if (v !== '' && v !== 0) {
        usp.set(k, String(v))
      }
    }
    const s = usp.toString()
    return '/catalog' + (s ? `?${s}` : '')
  }

  // Een schone tab-link (geen filters uit andere tab meeslepen).
  function tabHref(t: Tab): string {
    return t === 'combinaties' ? '/catalog' : '/catalog?tab=moswanden'
  }

  const combinatiesCount = combinaties.length
  const moswandenCount = moswanden.length

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <ScrollRestorer />
      <header className="mb-4">
        <h1 className="text-3xl font-serif text-stera-ink">Catalogus</h1>
        <p className="mt-1 text-sm text-stera-ink/70">
          {tab === 'combinaties'
            ? 'All-in-1 combinaties — plant in pot, voorgekweekt en met watermeter, klaar om af te leveren.'
            : 'Mosmuren — onderhoudsvrije wanddecoratie in aluminium, MDF of Nova-frames.'}
        </p>
      </header>

      {/* Tabs */}
      <nav className="mb-6 flex gap-1 border-b border-stera-ink/15">
        {(['combinaties', 'moswanden'] as Tab[]).map((t) => {
          const active = t === tab
          const label = t === 'combinaties' ? 'Combinaties' : 'Moswanden'
          const cnt = t === 'combinaties' ? combinatiesCount : moswandenCount
          return (
            <Link
              key={t}
              href={tabHref(t)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                active
                  ? 'border-stera-green text-stera-green'
                  : 'border-transparent text-stera-ink/60 hover:text-stera-ink'
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs text-stera-ink/40">
                ({cnt.toLocaleString('nl-BE')})
              </span>
            </Link>
          )
        })}
      </nav>

      <AutoSubmitForm method="GET" action="/catalog">
        <input type="hidden" name="f" value="1" />
        {tab !== 'combinaties' ? (
          <input type="hidden" name="tab" value={tab} />
        ) : null}

        {/* Pot-vorm — iconen-rij bovenaan, enkel op combinaties-tab */}
        {tab === 'combinaties' ? (
          <section className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-ink/60">
              Pot-vorm
            </p>
            <div className="flex flex-wrap gap-2">
              {SHAPES.map((shape) => {
                const checked = shapes.includes(shape)
                const count = shapeCounts.get(shape) ?? 0
                return (
                  <label
                    key={shape}
                    className="cursor-pointer"
                    title={`${shape} (${count})`}
                  >
                    <input
                      type="checkbox"
                      name="shape"
                      value={shape}
                      defaultChecked={checked}
                      className="peer sr-only"
                    />
                    <div className="flex min-w-[88px] items-center gap-2 rounded-full border border-stera-ink/20 bg-white px-3 py-2 text-sm text-stera-ink transition hover:border-stera-green peer-checked:border-stera-green peer-checked:bg-stera-green/10 peer-checked:text-stera-green">
                      <span className="shrink-0 text-stera-green">
                        <ShapeIcon name={shape} />
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">
                        {shape}
                      </span>
                    </div>
                  </label>
                )
              })}
            </div>
          </section>
        ) : null}

        {/* Mostype — iconen-rij bovenaan, enkel op moswanden-tab */}
        {tab === 'moswanden' ? (
          <section className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-ink/60">
              Mostype
            </p>
            <div className="flex flex-wrap gap-2">
              {(['Bolmos', 'Platmos', 'Rendiermos', 'Mix'] as Mostype[]).map(
                (mt) => {
                  const checked = mostypes.includes(mt)
                  const count = mostypeCounts.get(mt) ?? 0
                  return (
                    <label
                      key={mt}
                      className="cursor-pointer"
                      title={`${mt} (${count})`}
                    >
                      <input
                        type="checkbox"
                        name="mostype"
                        value={mt}
                        defaultChecked={checked}
                        className="peer sr-only"
                      />
                      <div className="flex min-w-[88px] items-center gap-2 rounded-full border border-stera-ink/20 bg-white px-4 py-2 text-sm text-stera-ink transition hover:border-stera-green peer-checked:border-stera-green peer-checked:bg-stera-green/10 peer-checked:text-stera-green">
                        <span className="flex-1 text-sm font-medium">
                          {mt}
                        </span>
                        <span className="text-xs text-stera-ink/50">
                          ({count})
                        </span>
                      </div>
                    </label>
                  )
                }
              )}
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Sidebar — op mobiel inklapbaar zodat producten meteen zichtbaar zijn */}
          <aside>
            <details className="overflow-hidden rounded-xl border border-stera-ink/10 bg-white/60 lg:rounded-none lg:border-0 lg:bg-transparent">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-stera-ink [&::-webkit-details-marker]:hidden lg:hidden">
                <span>Filters tonen / verbergen</span>
                <span aria-hidden className="text-stera-ink/40">
                  ≡
                </span>
              </summary>
              <div className="space-y-5 px-4 pb-4 lg:!block lg:px-0 lg:pb-0">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Zoek op naam..."
              className="w-full rounded-lg border border-stera-ink/20 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stera-ink/30"
            />

            <label className="flex items-center gap-2 rounded-lg border border-stera-ink/20 bg-white px-3 py-2 text-sm font-medium text-stera-ink">
              <input
                type="checkbox"
                name="inStock"
                value="1"
                defaultChecked={inStock}
                className="h-4 w-4 accent-stera-green"
              />
              Op voorraad
            </label>

            {tab === 'combinaties' ? (
              <FilterSection title="Substraat">
                <ul className="space-y-1.5">
                  {sortedSubstraten.map(([name, cnt]) => (
                    <li key={name}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="substraat"
                            value={name}
                            defaultChecked={substraten.includes(name)}
                            className="h-4 w-4 accent-stera-green"
                          />
                          {name}
                        </span>
                        <span className="text-xs text-stera-ink/50">({cnt})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </FilterSection>
            ) : null}

            {tab === 'combinaties' ? (
              <FilterSection title="Binnen / buiten">
                <ul className="space-y-1.5">
                  {(['Binnen', 'Buiten'] as const).map((loc) => {
                    const cnt = locatieCounts.get(loc) ?? 0
                    return (
                      <li key={loc}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              name="locatie"
                              value={loc}
                              defaultChecked={locaties.includes(loc)}
                              className="h-4 w-4 accent-stera-green"
                            />
                            {loc}
                          </span>
                          <span className="text-xs text-stera-ink/50">({cnt})</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </FilterSection>
            ) : null}

            {tab === 'combinaties' ? (
              <FilterSection title="Lichtbehoefte">
                <ul className="space-y-1.5">
                  {sortedLichten.map(([lux, cnt]) => (
                    <li key={lux}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="licht"
                            value={lux}
                            defaultChecked={lichten.includes(lux)}
                            className="h-4 w-4 accent-stera-green"
                          />
                          {lightLabel(Number(lux))}
                        </span>
                        <span className="text-xs text-stera-ink/50">({cnt})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </FilterSection>
            ) : null}

            <FilterSection title="Hoogte">
              <select
                name="height"
                defaultValue={height}
                className="w-full rounded-lg border border-stera-ink/20 bg-white px-3 py-2"
              >
                <option value="">Alle hoogtes</option>
                {Object.entries(HEIGHT_BUCKETS).map(([key, b]) => (
                  <option key={key} value={key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </FilterSection>

            {tab === 'combinaties' ? (
              <FilterSection title="Diameter">
                <select
                  name="diameter"
                  defaultValue={diameter}
                  className="w-full rounded-lg border border-stera-ink/20 bg-white px-3 py-2"
                >
                  <option value="">Alle Ø</option>
                  {allDiameters.map((d) => (
                    <option key={d} value={d}>
                      Ø {d} cm
                    </option>
                  ))}
                </select>
              </FilterSection>
            ) : null}

            {tab === 'combinaties' ? (
              <FilterSection title="Beplantingssysteem">
                <ul className="space-y-1.5">
                  {sortedSystemen.map(([name, cnt]) => (
                    <li key={name}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="system"
                            value={name}
                            defaultChecked={systems.includes(name)}
                            className="h-4 w-4 accent-stera-green"
                          />
                          {name}
                        </span>
                        <span className="text-xs text-stera-ink/50">
                          ({cnt})
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </FilterSection>
            ) : null}

            {tab === 'combinaties' ? (
              <FilterSection title="Plantsoort">
                <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
                  {sortedPlantsoorten.map(([name, cnt]) => (
                    <li key={name}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="plantsoort"
                            value={name}
                            defaultChecked={plantsoorten.includes(name)}
                            className="h-4 w-4 accent-stera-green"
                          />
                          {name}
                        </span>
                        <span className="text-xs text-stera-ink/50">
                          ({cnt})
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </FilterSection>
            ) : null}

            {tab === 'combinaties' ? (
              <FilterSection title="Merk">
                <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
                  {sortedMerken.map(([name, cnt]) => (
                    <li key={name}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="merk"
                            value={name}
                            defaultChecked={merken.includes(name)}
                            className="h-4 w-4 accent-stera-green"
                          />
                          {name}
                        </span>
                        <span className="text-xs text-stera-ink/50">
                          ({cnt})
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </FilterSection>
            ) : null}

            {tab === 'moswanden' ? (
              <FilterSection title="Frame-materiaal">
                <ul className="space-y-1.5">
                  {sortedFrames.map(([name, cnt]) => (
                    <li key={name}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="frame"
                            value={name}
                            defaultChecked={frames.includes(
                              name as FrameMateriaal
                            )}
                            className="h-4 w-4 accent-stera-green"
                          />
                          {name}
                        </span>
                        <span className="text-xs text-stera-ink/50">
                          ({cnt})
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </FilterSection>
            ) : null}

            {tab === 'moswanden' ? (
              <FilterSection title="Moskleur">
                <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
                  {sortedMoskleuren.map(([name, cnt]) => (
                    <li key={name}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="moskleur"
                            value={name}
                            defaultChecked={moskleuren.includes(name)}
                            className="h-4 w-4 accent-stera-green"
                          />
                          {name}
                        </span>
                        <span className="text-xs text-stera-ink/50">
                          ({cnt})
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </FilterSection>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-lg bg-stera-ink px-4 py-2 font-medium text-white transition hover:opacity-90"
              >
                Filter toepassen
              </button>
              <Link
                href={tabHref(tab)}
                className="rounded-lg border border-stera-ink/20 px-4 py-2 font-medium transition hover:bg-white"
              >
                Wis alles
              </Link>
            </div>
              </div>
            </details>
          </aside>

          {/* Resultaten */}
          <div>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-stera-ink/70">
                {error
                  ? `Fout: ${error.message}`
                  : `${totalCount.toLocaleString('nl-BE')} resultaten`}
              </p>
            </div>

            {pageItems.length === 0 ? (
              <div className="rounded-xl border border-stera-ink/10 bg-white/40 py-16 text-center text-stera-ink/60">
                {tab === 'combinaties'
                  ? 'Geen combinaties gevonden met deze filters.'
                  : 'Geen mosmuren gevonden met deze filters.'}
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                {pageItems.map((p) => (
                  <li
                    key={p.itemcode}
                    className="overflow-hidden rounded-xl border border-stera-ink/10 bg-white transition hover:border-stera-green hover:shadow-md"
                  >
                    <Link
                      href={`/catalog/${p.itemcode}`}
                      className="flex h-full flex-col"
                    >
                      <div className="relative aspect-square bg-stera-cream/40">
                        {p.item_picture_name ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={`/api/nieuwkoop/image/${p.itemcode}`}
                            alt={p.description}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-xs text-stera-ink/30">
                            Geen foto
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-3">
                        <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-tight text-stera-ink">
                          {p.description || p.itemcode}
                        </h3>
                        <div className="mt-1.5 flex gap-2">
                          <div className="min-w-0 flex-1 space-y-0.5">
                            {p.item_variety_nl ? (
                              <p className="truncate text-xs text-stera-ink/70">
                                {p.item_variety_nl}
                              </p>
                            ) : null}
                            <p className="font-mono text-[10px] text-stera-ink/50">
                              {p.itemcode}
                            </p>
                          </div>
                          <div className="shrink-0 space-y-0.5 border-l border-stera-ink/10 pl-2 text-xs text-stera-ink/60">
                            {p.diameter && p.diameter > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <span aria-hidden className="text-stera-ink/40">
                                  ⌀
                                </span>
                                <span>{Math.round(p.diameter)}</span>
                              </div>
                            ) : null}
                            {p.height && p.height > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <span aria-hidden className="text-stera-ink/40">
                                  ↕
                                </span>
                                <span>{Math.round(p.height)}</span>
                              </div>
                            ) : null}
                            {p.diameter_culture_pot &&
                            p.diameter_culture_pot > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <span aria-hidden className="text-stera-ink/40">
                                  ⌀
                                </span>
                                <span>
                                  {Math.round(p.diameter_culture_pot)}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {/* Verzorging in één oogopslag */}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.lightLux != null ? (
                            <span
                              title={lightLabel(p.lightLux)}
                              className="rounded bg-stera-cream/60 px-1.5 py-0.5 text-[10px] text-stera-ink/70"
                            >
                              ☀ {p.lightLux} lux
                            </span>
                          ) : null}
                          {p.locations.length > 0 ? (
                            <span className="rounded bg-stera-cream/60 px-1.5 py-0.5 text-[10px] text-stera-ink/70">
                              {p.locations.join(' / ')}
                            </span>
                          ) : null}
                          {p.substrate ? (
                            <span className="rounded bg-stera-cream/60 px-1.5 py-0.5 text-[10px] text-stera-ink/70">
                              {p.substrate}
                            </span>
                          ) : null}
                          {p.tempMin != null ? (
                            <span className="rounded bg-stera-cream/60 px-1.5 py-0.5 text-[10px] text-stera-ink/70">
                              ≥ {p.tempMin}°C
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-stera-ink/10 pt-2">
                          <span className="font-semibold text-stera-ink">
                            {formatPrice(
                              Number(p.suggested_sale_price ?? 0)
                            )}
                          </span>
                          {p.stockAvailable > 0 ? (
                            <span className="shrink-0 rounded-full bg-stera-green/10 px-2 py-0.5 text-[10px] font-medium text-stera-green">
                              op voorraad
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-stera-ink/5 px-2 py-0.5 text-[10px] text-stera-ink/50">
                              op aanvraag
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <nav className="mt-8 flex items-center justify-between gap-2">
                <Link
                  href={buildHref({ page: Math.max(1, safePage - 1) })}
                  aria-disabled={safePage <= 1}
                  className={`rounded-lg border border-stera-ink/20 px-4 py-2 transition ${
                    safePage <= 1
                      ? 'pointer-events-none opacity-40'
                      : 'hover:bg-white'
                  }`}
                >
                  ← Vorige
                </Link>
                <span className="text-sm text-stera-ink/70">
                  Pagina {safePage.toLocaleString('nl-BE')} van{' '}
                  {totalPages.toLocaleString('nl-BE')}
                </span>
                <Link
                  href={buildHref({
                    page: Math.min(totalPages, safePage + 1),
                  })}
                  aria-disabled={safePage >= totalPages}
                  className={`rounded-lg border border-stera-ink/20 px-4 py-2 transition ${
                    safePage >= totalPages
                      ? 'pointer-events-none opacity-40'
                      : 'hover:bg-white'
                  }`}
                >
                  Volgende →
                </Link>
              </nav>
            )}
          </div>
        </div>
      </AutoSubmitForm>
    </main>
  )
}

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-stera-ink/10 pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-ink/60">
        {title}
      </p>
      {children}
    </div>
  )
}
