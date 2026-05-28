/**
 * Stera Pro — Catalogus pagina
 *
 * Toont enkel de Nieuwkoop "All-in-1 concepts" (productgroep 275):
 * combinaties van plant + pot die voorgekweekt en met watermeter
 * geleverd worden. Voor Stera is dit het ideale assortiment — we
 * leveren ze gewoon af.
 */

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 48
const GROUP_CODE = '275' // All-in-1 concepts (Combinaties)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

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
}

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

// --- Icon-knoppen voor lichtbehoefte (zoals bij Nieuwkoop) -----------

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
      aria-hidden
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
      aria-hidden
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
      aria-hidden
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
  const heightMin = Number(params.heightMin) || 0
  const heightMax = Number(params.heightMax) || 0
  const priceMin = Number(params.priceMin) || 0
  const priceMax = Number(params.priceMax) || 0
  const page = Math.max(1, Number(params.page) || 1)

  // Beschikbare pot-diameters binnen de combinaties — voor de dropdown.
  const { data: diameterRows } = await supabase
    .from('v_nieuwkoop_with_margin')
    .select('diameter')
    .eq('product_group_code', GROUP_CODE)
    .not('diameter', 'is', null)

  const allDiameters: number[] = Array.from(
    new Set(
      ((diameterRows ?? []) as Array<{ diameter: number | null }>)
        .map((d) => Number(d.diameter))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.round(n))
    )
  ).sort((a, b) => a - b)

  // Hoofdquery met filters
  let query = supabase
    .from('v_nieuwkoop_with_margin')
    .select(
      'itemcode, description, item_picture_name, cost_price, effective_margin_factor, suggested_sale_price, product_group_code, height, diameter, diameter_culture_pot, pot_size, location_icon_nl',
      { count: 'exact' }
    )
    .eq('product_group_code', GROUP_CODE)

  if (q) query = query.ilike('description', `%${q}%`)
  if (light) query = query.eq('location_icon_nl', light)
  if (diameter) query = query.eq('diameter', Number(diameter))
  if (heightMin > 0) query = query.gte('height', heightMin)
  if (heightMax > 0) query = query.lte('height', heightMax)
  if (priceMin > 0) query = query.gte('suggested_sale_price', priceMin)
  if (priceMax > 0) query = query.lte('suggested_sale_price', priceMax)

  query = query
    .order('description')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data: products, count, error } = await query

  function buildHref(overrides: Record<string, string | number>) {
    const usp = new URLSearchParams()
    if (q) usp.set('q', q)
    if (light) usp.set('light', light)
    if (diameter) usp.set('diameter', diameter)
    if (heightMin > 0) usp.set('heightMin', String(heightMin))
    if (heightMax > 0) usp.set('heightMax', String(heightMax))
    if (priceMin > 0) usp.set('priceMin', String(priceMin))
    if (priceMax > 0) usp.set('priceMax', String(priceMax))
    if (page > 1) usp.set('page', String(page))
    for (const [k, v] of Object.entries(overrides)) {
      if (v === '' || v === 0) usp.delete(k)
      else usp.set(k, String(v))
    }
    const s = usp.toString()
    return '/catalog' + (s ? `?${s}` : '')
  }

  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1
  const list = (products ?? []) as Product[]

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-3xl font-serif text-stera-ink">Catalogus</h1>
        <p className="mt-1 text-sm text-stera-ink/70">
          Nieuwkoop All-in-1 combinaties: plant in pot, voorgekweekt
          en met watermeter — klaar om af te leveren.
        </p>
      </header>

      <form
        method="GET"
        action="/catalog"
        className="mb-6 grid gap-3 rounded-xl border border-stera-ink/10 bg-white/60 p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Zoek op naam..."
          className="sm:col-span-2 lg:col-span-2 rounded-lg border border-stera-ink/20 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stera-ink/30"
        />

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

        <select
          name="diameter"
          defaultValue={diameter}
          className="rounded-lg border border-stera-ink/20 bg-white px-3 py-2"
        >
          <option value="">Alle Ø</option>
          {allDiameters.map((d) => (
            <option key={d} value={d}>
              Ø {d} cm
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <input
            type="number"
            name="heightMin"
            min={0}
            defaultValue={heightMin || ''}
            placeholder="H min"
            className="w-1/2 rounded-lg border border-stera-ink/20 bg-white px-3 py-2"
          />
          <input
            type="number"
            name="heightMax"
            min={0}
            defaultValue={heightMax || ''}
            placeholder="H max"
            className="w-1/2 rounded-lg border border-stera-ink/20 bg-white px-3 py-2"
          />
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            name="priceMin"
            min={0}
            defaultValue={priceMin || ''}
            placeholder="€ min"
            className="w-1/2 rounded-lg border border-stera-ink/20 bg-white px-3 py-2"
          />
          <input
            type="number"
            name="priceMax"
            min={0}
            defaultValue={priceMax || ''}
            placeholder="€ max"
            className="w-1/2 rounded-lg border border-stera-ink/20 bg-white px-3 py-2"
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-6 flex flex-wrap items-center gap-2">
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
            Reset
          </Link>
          <span className="ml-auto text-xs text-stera-ink/50">
            {error
              ? `Fout: ${error.message}`
              : `${(count ?? 0).toLocaleString('nl-BE')} resultaten`}
          </span>
        </div>
      </form>

      {list.length === 0 ? (
        <div className="rounded-xl border border-stera-ink/10 bg-white/40 py-16 text-center text-stera-ink/60">
          Geen combinaties gevonden met deze filters.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
          {list.map((p) => (
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
                  <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-medium leading-tight text-stera-ink">
                    {generateSteraName(p)}
                  </h3>
                  <div className="mt-auto flex items-baseline justify-between gap-2 pt-2">
                    <span className="font-semibold text-stera-ink">
                      {formatPrice(Number(p.suggested_sale_price ?? 0))}
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
            href={buildHref({ page: Math.max(1, page - 1) })}
            aria-disabled={page <= 1}
            className={`rounded-lg border border-stera-ink/20 px-4 py-2 transition ${
              page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-white'
            }`}
          >
            ← Vorige
          </Link>
          <span className="text-sm text-stera-ink/70">
            Pagina {page.toLocaleString('nl-BE')} van{' '}
            {totalPages.toLocaleString('nl-BE')}
          </span>
          <Link
            href={buildHref({ page: Math.min(totalPages, page + 1) })}
            aria-disabled={page >= totalPages}
            className={`rounded-lg border border-stera-ink/20 px-4 py-2 transition ${
              page >= totalPages
                ? 'pointer-events-none opacity-40'
                : 'hover:bg-white'
            }`}
          >
            Volgende →
          </Link>
        </nav>
      )}
    </main>
  )
}
