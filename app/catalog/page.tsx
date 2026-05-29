/**
 * Stera Pro — Catalogus pagina
 *
 * Toont enkel productgroep 275 "All-in-1 concepts" (combinaties van
 * plant + pot voorgekweekt met watermeter).
 *
 * Filters:
 *  - Vrij zoeken op naam
 *  - Op voorraad (default aan)
 *  - Pot-vorm: 16 vormen als klikbare iconen-rij (multi-select)
 *  - Lichtbehoefte: zon / half-schaduw / schaduw (icoon-buttons)
 *  - Hoogte-bereik (dropdown met buckets)
 *  - Diameter (dropdown van voorkomende waardes)
 *  - Beplantingssysteem (multi-select checkboxes met aantallen)
 *  - Plantsoort (multi-select met aantallen — afgeleid uit description)
 *  - Merk (multi-select met aantallen — afgeleid uit description)
 *
 * Plantsoort en pot-merk worden uit de description afgeleid omdat
 * de leverancier ze niet als aparte velden teruggeeft voor combinaties.
 * Pot-vorm wordt heuristisch uit de pot-naam gehaald via een
 * keyword-mapping.
 */

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

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
// Heuristiek: zoek bekende vorm-woorden in de pot-naam (het stuk van
// de description ná "in "). Eerste match wint. Geen match → "Overig".

const SHAPES = [
  'Balloon',
  'Barrel',
  'Bowl',
  'Couple',
  'Cube',
  'Cylinder',
  'Darcy',
  'Emperor',
  'Globe',
  'Kubis',
  'Op Pootjes',
  'Oval',
  'Partner',
  'Rectangle',
  'Square',
  'Overig',
] as const
type Shape = (typeof SHAPES)[number]

const SHAPE_KEYWORDS: Record<Exclude<Shape, 'Overig'>, string[]> = {
  Balloon: ['balloon', 'ballon'],
  Barrel: ['barrel', 'vat'],
  Bowl: ['bowl', 'kom', 'schaal', 'shallow'],
  Couple: ['couple'],
  Cube: ['cube', 'kubus'],
  Cylinder: ['cylinder', 'cilinder'],
  Darcy: ['darcy'],
  Emperor: ['emperor'],
  Globe: ['globe', 'bol ', ' ball ', 'ball '],
  Kubis: ['kubis'],
  'Op Pootjes': ['pootjes', 'pootje', 'op voet'],
  Oval: ['oval', 'ovaal'],
  Partner: ['partner'],
  Rectangle: ['rectangle', 'rectangular', 'rechthoek'],
  Square: ['square', 'vierkant'],
}

function detectShape(potName: string): Shape {
  const lower = ` ${potName.toLowerCase()} `
  for (const shape of SHAPES) {
    if (shape === 'Overig') continue
    const keywords = SHAPE_KEYWORDS[shape as Exclude<Shape, 'Overig'>]
    for (const kw of keywords) {
      if (lower.includes(kw)) return shape
    }
  }
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

// --- SVG icoontjes -------------------------------------------------

function SunIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function PartlyCloudyIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 4v1M19 8h1M16.95 5.05l.7.7M9.5 7.5a3 3 0 0 1 5.5 1.5" />
      <path d="M5 17a4 4 0 0 0 4 4h7a4 4 0 0 0 0-8 5 5 0 0 0-9-2 4 4 0 0 0-2 6Z" />
    </svg>
  )
}

function CloudIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 17a4 4 0 0 0 4 4h7a4 4 0 0 0 0-8 5 5 0 0 0-9-2 4 4 0 0 0-2 6Z" />
    </svg>
  )
}

function LightOption({
  value,
  current,
  label,
  children,
}: {
  value: string
  current: string
  label: string
  children?: React.ReactNode
}) {
  return (
    <label
      title={label}
      aria-label={label}
      className="relative flex h-11 min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-stera-ink/20 bg-white px-3 text-stera-ink transition hover:border-stera-green has-[:checked]:border-stera-green has-[:checked]:bg-stera-green/10 has-[:checked]:text-stera-green"
    >
      <input
        type="radio"
        name="light"
        value={value}
        defaultChecked={value === current}
        className="sr-only"
      />
      {children ?? <span className="text-xs font-medium">{label}</span>}
    </label>
  )
}

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
    case 'Balloon':
      return (
        <svg {...p}>
          <path d="M16 6c-5 0-8 4-8 9 0 6 4 11 8 11s8-5 8-11c0-5-3-9-8-9z" />
        </svg>
      )
    case 'Barrel':
      return (
        <svg {...p}>
          <path d="M9 8c0-1 14-1 14 0v17c0 1-14 1-14 0z" />
          <path d="M7 14c2 0 16 0 18 0M7 22c2 0 16 0 18 0" />
        </svg>
      )
    case 'Bowl':
      return (
        <svg {...p}>
          <path d="M5 14h22c0 6-5 12-11 12S5 20 5 14z" />
        </svg>
      )
    case 'Couple':
      return (
        <svg {...p}>
          <rect x="6" y="9" width="9" height="18" rx="1.5" />
          <rect x="17" y="9" width="9" height="18" rx="1.5" />
        </svg>
      )
    case 'Cube':
      return (
        <svg {...p}>
          <path d="M8 11l8-4 8 4-8 4-8-4z" />
          <path d="M8 11v12l8 4 8-4V11" />
          <path d="M16 15v12" />
        </svg>
      )
    case 'Cylinder':
      return (
        <svg {...p}>
          <ellipse cx="16" cy="8" rx="8" ry="2.5" />
          <path d="M8 8v17c0 1.5 16 1.5 16 0V8" />
        </svg>
      )
    case 'Darcy':
      return (
        <svg {...p}>
          <path d="M10 8c0-2 12-2 12 0v17c0 2-12 2-12 0z" />
        </svg>
      )
    case 'Emperor':
      return (
        <svg {...p}>
          <path d="M9 9c0-1 14-1 14 0l-1 16c0 1-12 1-12 0z" />
        </svg>
      )
    case 'Globe':
      return (
        <svg {...p}>
          <circle cx="16" cy="17" r="9" />
        </svg>
      )
    case 'Kubis':
      return (
        <svg {...p}>
          <path d="M9 25l3-17h8l3 17z" />
        </svg>
      )
    case 'Op Pootjes':
      return (
        <svg {...p}>
          <ellipse cx="16" cy="10" rx="8" ry="2.5" />
          <path d="M8 10v12c0 1.5 16 1.5 16 0V10" />
          <path d="M11 25v3M21 25v3" />
        </svg>
      )
    case 'Oval':
      return (
        <svg {...p}>
          <ellipse cx="16" cy="17" rx="11" ry="8" />
        </svg>
      )
    case 'Partner':
      return (
        <svg {...p}>
          <ellipse cx="11" cy="17" rx="6" ry="9" />
          <ellipse cx="21" cy="17" rx="6" ry="9" />
        </svg>
      )
    case 'Rectangle':
      return (
        <svg {...p}>
          <rect x="4" y="11" width="24" height="14" rx="1.5" />
        </svg>
      )
    case 'Square':
      return (
        <svg {...p}>
          <rect x="7" y="7" width="18" height="20" rx="1.5" />
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
}

type Enriched = Product & {
  plantsoort: string
  merk: string
  shape: Shape
}

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

// --- Page -----------------------------------------------------------

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q.trim() : ''
  const light = typeof params.light === 'string' ? params.light : ''
  const diameter =
    typeof params.diameter === 'string' ? params.diameter : ''
  const height = typeof params.height === 'string' ? params.height : ''
  const heightBucket = HEIGHT_BUCKETS[height] ?? null
  const formSubmitted = typeof params.f === 'string'
  // Standaard NIET filteren op voorraad — momenteel zijn de meeste
  // artikels niet als 'op voorraad' geregistreerd in de sync, dus dat
  // zou de lijst leeg maken. De gebruiker kan zelf aanvinken.
  const inStock = formSubmitted ? params.inStock === '1' : false
  const systems = parseArray(params.system)
  const shapes = parseArray(params.shape) as Shape[]
  const plantsoorten = parseArray(params.plantsoort)
  const merken = parseArray(params.merk)
  const page = Math.max(1, Number(params.page) || 1)

  // Server-side fetch — alles in groep 275 met een foto. (is_stock_item
  // doen we in-memory zodat de optellingen ook items zonder voorraad
  // mee kunnen tellen wanneer de gebruiker dat vinkje uitzet.)
  // item_variety_nl zit (nog) niet in de view — we halen het apart op
  // uit nieuwkoop_products en mergen op itemcode.
  let baseQuery = supabase
    .from('v_nieuwkoop_with_margin')
    .select(
      'itemcode, description, item_picture_name, cost_price, effective_margin_factor, suggested_sale_price, product_group_code, height, diameter, diameter_culture_pot, pot_size, location_icon_nl, is_stock_item'
    )
    .eq('product_group_code', GROUP_CODE)
    .not('item_picture_name', 'is', null)
    .neq('item_picture_name', '')
    .order('description')
    .limit(5000)

  if (inStock) baseQuery = baseQuery.eq('is_stock_item', true)

  const [{ data: rawItems, error }, { data: nieuwkoopRows }] = await Promise.all(
    [
      baseQuery,
      supabase
        .from('nieuwkoop_products')
        .select('itemcode, item_variety_nl, has_image')
        .eq('product_group_code', GROUP_CODE),
    ]
  )

  // Bouw twee maps: varietyByCode voor de beplantingssysteem-info,
  // photoOkCodes voor "heeft echt een foto" (true) of "nog niet
  // gecheckt" (null). false = uitsluiten.
  const varietyByCode = new Map<string, string>()
  const photoOkCodes = new Set<string>()
  for (const v of (nieuwkoopRows ?? []) as Array<{
    itemcode: string
    item_variety_nl: string | null
    has_image: boolean | null
  }>) {
    if (v.itemcode && v.item_variety_nl) {
      varietyByCode.set(v.itemcode, v.item_variety_nl)
    }
    if (v.itemcode && v.has_image !== false) {
      photoOkCodes.add(v.itemcode)
    }
  }

  const items = ((rawItems ?? []) as Omit<Product, 'item_variety_nl'>[])
    .filter(
      (it) =>
        it.item_picture_name &&
        String(it.item_picture_name).trim() !== '' &&
        photoOkCodes.has(it.itemcode)
    )
    .map(
      (it) =>
        ({
          ...it,
          item_variety_nl: varietyByCode.get(it.itemcode) ?? null,
        }) as Product
    )

  // Verrijk met afgeleide velden.
  const enriched: Enriched[] = items.map((it) => {
    const { plantPart, potPart } = splitDescription(it.description || '')
    return {
      ...it,
      plantsoort: extractPlantsoort(plantPart),
      merk: extractMerk(potPart),
      shape: detectShape(potPart),
    }
  })

  // Tellingen per filterblok — op de geënrichte set (vóór de overige
  // filters). Zo zien de gebruiker steeds het volledige plaatje.
  const plantsoortCounts = countBy(enriched, (x) => x.plantsoort)
  const merkCounts = countBy(enriched, (x) => x.merk)
  const systeemCounts = countBy(enriched, (x) => x.item_variety_nl ?? '')
  const shapeCounts = countBy(enriched, (x) => x.shape)

  // In-memory filtering.
  let filtered = enriched
  if (q) {
    const ql = q.toLowerCase()
    filtered = filtered.filter((x) =>
      (x.description || '').toLowerCase().includes(ql)
    )
  }
  if (light) filtered = filtered.filter((x) => x.location_icon_nl === light)
  if (diameter)
    filtered = filtered.filter(
      (x) => Math.round(Number(x.diameter)) === Number(diameter)
    )
  if (heightBucket?.min != null)
    filtered = filtered.filter(
      (x) => (x.height ?? 0) >= (heightBucket.min ?? 0)
    )
  if (heightBucket?.max != null)
    filtered = filtered.filter(
      (x) => (x.height ?? 0) <= (heightBucket.max ?? 0)
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

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  )

  // Beschikbare pot-diameters (in de huidige stock-set).
  const allDiameters: number[] = Array.from(
    new Set(
      enriched
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

  function buildHref(overrides: Record<string, string | number | string[]>) {
    const usp = new URLSearchParams()
    usp.set('f', '1')
    if (q) usp.set('q', q)
    if (light) usp.set('light', light)
    if (diameter) usp.set('diameter', diameter)
    if (height) usp.set('height', height)
    if (inStock) usp.set('inStock', '1')
    for (const s of systems) usp.append('system', s)
    for (const s of shapes) usp.append('shape', s)
    for (const s of plantsoorten) usp.append('plantsoort', s)
    for (const s of merken) usp.append('merk', s)
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

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-4">
        <h1 className="text-3xl font-serif text-stera-ink">Catalogus</h1>
        <p className="mt-1 text-sm text-stera-ink/70">
          All-in-1 combinaties — plant in pot, voorgekweekt en met
          watermeter, klaar om af te leveren.
        </p>
      </header>

      <form method="GET" action="/catalog">
        <input type="hidden" name="f" value="1" />

        {/* Pot-vorm — iconen-rij bovenaan */}
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

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className="space-y-5">
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

            <FilterSection title="Lichtbehoefte">
              <fieldset className="flex flex-wrap items-center gap-1.5">
                <legend className="sr-only">Lichtbehoefte</legend>
                <LightOption value="" current={light} label="Alle" />
                <LightOption value="zon" current={light} label="Zon">
                  <SunIcon />
                </LightOption>
                <LightOption
                  value="half-schaduw"
                  current={light}
                  label="Half-schaduw"
                >
                  <PartlyCloudyIcon />
                </LightOption>
                <LightOption value="schaduw" current={light} label="Schaduw">
                  <CloudIcon />
                </LightOption>
              </fieldset>
            </FilterSection>

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

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-lg bg-stera-ink px-4 py-2 font-medium text-white transition hover:opacity-90"
              >
                Filter toepassen
              </button>
              <Link
                href="/catalog"
                className="rounded-lg border border-stera-ink/20 px-4 py-2 font-medium transition hover:bg-white"
              >
                Wis alles
              </Link>
            </div>
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
                Geen combinaties gevonden met deze filters.
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
                        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-stera-ink/10 pt-2">
                          <span className="font-semibold text-stera-ink">
                            {formatPrice(
                              Number(p.suggested_sale_price ?? 0)
                            )}
                          </span>
                          {p.location_icon_nl ? (
                            <span className="truncate text-[10px] uppercase tracking-wider text-stera-ink/50">
                              {p.location_icon_nl}
                            </span>
                          ) : null}
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
      </form>
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
