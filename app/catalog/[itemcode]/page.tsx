/**
 * Detailpagina voor één artikel uit de catalogus — weergave-versie.
 *
 * Layout:
 *  - Breadcrumb
 *  - Kop: compacte foto links, titel + verzorgingschips + prijs rechts
 *  - "Over deze plant": leesbare beschrijving, samengesteld uit de
 *    Nieuwkoop-kenmerken (+ de eventuele leverancierstekst)
 *  - "Verzorging": licht, standplaats, substraat, temperatuur in kaartjes
 *  - "Afmetingen": kerncijfers
 *  - "Technische gegevens": uitklapbaar (export-codes e.d.)
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import BackButton from '../BackButton'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

function formatPrice(n: number | null | undefined) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(num)
}

function formatCm(n: number | null | undefined) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num) || num === 0) return '—'
  return `${Math.round(num)} cm`
}

function formatGr(n: number | null | undefined) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num) || num === 0) return '—'
  return `${Math.round(num)} g`
}

function formatBool(v: boolean | null | undefined) {
  if (v == null) return '—'
  return v ? 'ja' : 'nee'
}

function formatDateTime(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })
}

function val(v: unknown) {
  if (v == null || v === '') return '—'
  return String(v)
}

function firstNum(vals: string[]): number | null {
  for (const v of vals) {
    const n = Number(String(v).replace(/[^\d.-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

const LIGHT_LABELS: Record<string, string> = {
  '500': 'Weinig licht (500 lux)',
  '750': 'Halfschaduw (750 lux)',
  '1000': 'Veel licht (1000 lux)',
  '1500': 'Vol zon (1500 lux)',
}
function lightLabel(lux: number | null): string {
  if (lux == null) return '—'
  return LIGHT_LABELS[String(lux)] ?? `${lux} lux`
}

function lower(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function SpecRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-stera-ink/5 py-1.5 last:border-0">
      <span className="text-sm text-stera-ink/60">{label}</span>
      <span className="text-right text-sm text-stera-ink">{children}</span>
    </div>
  )
}

function CareCard({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-stera-ink/10 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stera-ink/50">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-stera-ink">{value}</p>
    </div>
  )
}

export default async function CatalogItemPage({
  params,
}: {
  params: Promise<{ itemcode: string }>
}) {
  const { itemcode } = await params

  const [{ data: viewItem }, { data: rawItem }, { data: stockItem }] =
    await Promise.all([
      supabase
        .from('v_nieuwkoop_with_margin')
        .select('*')
        .eq('itemcode', itemcode)
        .maybeSingle(),
      supabase
        .from('nieuwkoop_products')
        .select('*')
        .eq('itemcode', itemcode)
        .maybeSingle(),
      supabase
        .from('nieuwkoop_stock')
        .select('stock_available')
        .eq('itemcode', itemcode)
        .maybeSingle(),
    ])

  if (!viewItem) notFound()

  const v = viewItem as Record<string, unknown>
  const r = (rawItem ?? {}) as Record<string, unknown>
  const get = (key: string): unknown =>
    v[key] !== undefined ? v[key] : r[key]

  const description =
    (get('description') as string | null) ||
    (get('itemcode') as string | null) ||
    'Artikel'
  const itemDescriptionNl = get('item_description_nl') as string | null
  const itemVariety = get('item_variety_nl') as string | null
  const productGroupDesc =
    (get('product_group_description_nl') as string | null) || 'Combinaties'

  const photoSrc = (get('item_picture_name') as string | null)
    ? `/api/nieuwkoop/image/${encodeURIComponent(itemcode)}`
    : null

  // --- Tags ontleden ------------------------------------------------
  type RawTagValue = { Description_NL?: string | null }
  type RawTag = { Code?: string | null; Values?: RawTagValue[] | null }
  const rawTags: RawTag[] = Array.isArray(r.tags) ? (r.tags as RawTag[]) : []
  function tagOf(code: string): string[] {
    const t = rawTags.find((x) => x?.Code === code)
    return (t?.Values ?? [])
      .map((vv) => (vv?.Description_NL ?? '').trim())
      .filter(Boolean)
  }

  const plantCategory = tagOf('PlantCategory')[0] ?? null
  const plantVariety = tagOf('PlantVariety')[0] ?? null
  const plantShape = tagOf('PlantShape')[0] ?? null
  const leafColours = tagOf('LeafColourTint')
  const leafShape = tagOf('LeafShape')[0] ?? null
  const leafSize = tagOf('LeafSize')[0] ?? null
  const blooming = tagOf('Blooming')[0] ?? null
  const evergreen = tagOf('EvergreenPlant')[0] ?? null
  const locations = tagOf('Location') // Binnen / Buiten
  const lightLux = firstNum(tagOf('LocationLight'))
  const tempMin = firstNum(tagOf('Temperature'))
  const substrate = tagOf('SubstrateType')[0] ?? null

  // --- Beschrijving samenstellen uit de échte kenmerken -------------
  const descParts: string[] = []
  if (substrate) {
    descParts.push(
      `${description} is een kant-en-klare combinatie van plant en sierpot, geleverd in ${lower(
        substrate
      )} en voorzien van een watermeter — klaar om te plaatsen.`
    )
  } else {
    descParts.push(`${description}.`)
  }
  if (plantShape || leafColours.length) {
    const bits: string[] = []
    if (plantShape) bits.push(`haar ${lower(plantShape)}-vorm`)
    if (leafColours.length)
      bits.push(`${leafColours.map((c) => lower(c)).join('/')} blad`)
    descParts.push(`Deze plant valt op door ${bits.join(' en ')}.`)
  }
  const standplaats: string[] = []
  if (lightLux != null) standplaats.push(`een plek met ${lower(lightLabel(lightLux))}`)
  if (locations.length)
    standplaats.push(`is geschikt voor ${locations.map((l) => lower(l)).join(' en ')}`)
  if (standplaats.length)
    descParts.push(`Ze gedijt het best op ${standplaats.join(' en ')}.`)
  if (tempMin != null)
    descParts.push(`Houd de temperatuur bij voorkeur boven ${tempMin}°C.`)
  const composedDescription = descParts.join(' ')

  // Afmetingen / prijs
  const height = get('height') as number | null
  const diameter = get('diameter') as number | null
  const diameterCulturePot = get('diameter_culture_pot') as number | null
  const heightCulturePot = get('height_culture_pot') as number | null
  const potSize = get('pot_size') as string | null
  const opening = get('opening') as number | null
  const width = get('width') as number | null
  const depth = get('depth') as number | null
  const weight = get('weight') as number | null

  // Let op: inkoopprijs (cost_price) en marge worden hier BEWUST niet
  // opgehaald of getoond — de catalogus(detail) mag de klant bekijken.
  const suggestedPrice = get('suggested_sale_price') as number | null
  const stockAvailable = Number(
    (stockItem as { stock_available?: number } | null)?.stock_available ?? 0
  )

  const locationUsage = get('location_usage_planters_nl') as string | null
  const mainGroupDesc = get('main_group_description_nl') as string | null
  const subGroupDesc = get('group_description_nl') as string | null

  // Technische / logistieke gegevens
  const isStock = get('is_stock_item') as boolean | null
  const salesPackage = get('sales_package_nl') as string | null
  const salesOrderSize = get('sales_order_size') as number | string | null
  const deliveryDays = get('delivery_time_in_days') as number | null
  const countryOfOrigin = get('country_of_origin') as string | null
  const countryOfProvenance = get('country_of_provenance') as string | null
  const citesListed = get('cites_listed') as boolean | null
  const fytoListed = get('fyto_listed') as boolean | null
  const plantPassport = get('plant_passport_code') as string | null
  const gtin = get('gtin_code') as string | null
  const hsCode = get('hs_code') as string | null
  const hsCodeUk = get('hs_code_uk') as string | null
  const sysmodified = get('sysmodified') as string | null
  const syncedAt = get('synced_at') as string | null

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Terug + breadcrumb */}
      <div className="flex items-center gap-3">
        <BackButton />
        <nav aria-label="Breadcrumb" className="text-sm text-stera-ink/60">
          <Link href="/catalog" className="hover:text-stera-green">
            Catalogus
          </Link>
          <span className="mx-2">›</span>
          <span className="text-stera-ink/80">{description}</span>
        </nav>
      </div>

      {/* Kop: compacte foto + info */}
      <div className="mt-5 grid gap-8 md:grid-cols-[minmax(0,360px)_1fr]">
        <div>
          <div className="mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl border border-stera-ink/10 bg-white p-4 shadow-sm md:max-w-none">
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc}
                alt={description}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-stera-ink/30">
                Geen foto beschikbaar
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <p className="stera-eyebrow text-stera-green">{productGroupDesc}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-stera-ink sm:text-3xl">
            {description}
          </h1>
          {itemVariety ? (
            <p className="mt-1 text-sm text-stera-ink/60">{itemVariety}</p>
          ) : null}
          <p className="mt-1 text-xs text-stera-ink/40">
            Artikelcode <span className="font-mono">{itemcode}</span>
          </p>

          {/* Verzorgingschips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {lightLux != null ? (
              <span className="rounded-full bg-stera-cream/70 px-3 py-1 text-xs text-stera-ink/80">
                ☀ {lightLabel(lightLux)}
              </span>
            ) : null}
            {locations.length > 0 ? (
              <span className="rounded-full bg-stera-cream/70 px-3 py-1 text-xs text-stera-ink/80">
                {locations.join(' / ')}
              </span>
            ) : null}
            {substrate ? (
              <span className="rounded-full bg-stera-cream/70 px-3 py-1 text-xs text-stera-ink/80">
                {substrate}
              </span>
            ) : null}
            {tempMin != null ? (
              <span className="rounded-full bg-stera-cream/70 px-3 py-1 text-xs text-stera-ink/80">
                ≥ {tempMin}°C
              </span>
            ) : null}
          </div>

          {/* Prijs + voorraad */}
          <div className="mt-5 rounded-2xl border border-stera-green/30 bg-stera-green/5 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-stera-ink/60">Verkoopprijs</p>
                <p className="text-2xl font-bold text-stera-green">
                  {formatPrice(suggestedPrice)}
                </p>
              </div>
              {stockAvailable > 0 ? (
                <span className="rounded-full bg-stera-green/15 px-3 py-1 text-xs font-medium text-stera-green">
                  Op voorraad
                </span>
              ) : (
                <span className="rounded-full bg-stera-ink/5 px-3 py-1 text-xs text-stera-ink/50">
                  Op aanvraag
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Over deze plant */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-stera-ink">Over deze plant</h2>
        <p className="mt-3 leading-relaxed text-stera-ink/90">
          {composedDescription}
        </p>
        {itemDescriptionNl &&
        itemDescriptionNl.trim() &&
        itemDescriptionNl.trim() !== description.trim() ? (
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-stera-ink/80">
            {itemDescriptionNl}
          </p>
        ) : null}
      </section>

      {/* Verzorging */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-stera-ink">Verzorging</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CareCard label="Lichtbehoefte" value={lightLabel(lightLux)} />
          <CareCard
            label="Standplaats"
            value={locations.length ? locations.join(' / ') : '—'}
          />
          <CareCard label="Substraat" value={substrate ?? '—'} />
          <CareCard
            label="Min. temperatuur"
            value={tempMin != null ? `${tempMin}°C` : '—'}
          />
          {plantCategory ? (
            <CareCard label="Plantsoort" value={plantCategory} />
          ) : null}
          {leafColours.length ? (
            <CareCard label="Bladkleur" value={leafColours.join(', ')} />
          ) : null}
          {leafShape ? <CareCard label="Bladvorm" value={leafShape} /> : null}
          {plantShape ? <CareCard label="Groeivorm" value={plantShape} /> : null}
          {blooming ? <CareCard label="Bloei" value={blooming} /> : null}
          {evergreen ? (
            <CareCard label="Bladhoudend" value={evergreen} />
          ) : null}
          {leafSize ? <CareCard label="Bladgrootte" value={leafSize} /> : null}
          {locationUsage ? (
            <CareCard label="Toepassing" value={locationUsage} />
          ) : null}
        </div>
      </section>

      {/* Afmetingen */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-stera-ink">Afmetingen</h2>
        <div className="mt-3 grid gap-x-8 gap-y-1 rounded-xl border border-stera-ink/10 bg-white p-4 sm:grid-cols-2">
          <SpecRow label="Hoogte">{formatCm(height)}</SpecRow>
          <SpecRow label="Diameter">{formatCm(diameter)}</SpecRow>
          <SpecRow label="Breedte">{formatCm(width)}</SpecRow>
          <SpecRow label="Diepte">{formatCm(depth)}</SpecRow>
          <SpecRow label="Ø plantenbak">{formatCm(diameterCulturePot)}</SpecRow>
          <SpecRow label="Ø cultuurpot">{formatCm(heightCulturePot)}</SpecRow>
          <SpecRow label="Opening">{formatCm(opening)}</SpecRow>
          <SpecRow label="Pot-maat">{val(potSize)}</SpecRow>
        </div>
      </section>

      {/* Technische gegevens — uitklapbaar, secundair */}
      <details className="mt-8 rounded-xl border border-stera-ink/10 bg-white/60">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stera-ink/70 hover:text-stera-ink">
          Technische gegevens
        </summary>
        <div className="grid gap-x-8 gap-y-1 px-4 pb-4 sm:grid-cols-2">
          <SpecRow label="Hoofdgroep">{val(mainGroupDesc)}</SpecRow>
          <SpecRow label="Subgroep">{val(subGroupDesc)}</SpecRow>
          <SpecRow label="Beplantingssysteem">{val(itemVariety)}</SpecRow>
          <SpecRow label="Gewicht">{formatGr(weight)}</SpecRow>
          <SpecRow label="Voorraad-item">{formatBool(isStock)}</SpecRow>
          <SpecRow label="Beschikbaar (stuks)">{stockAvailable || '—'}</SpecRow>
          <SpecRow label="Verpakking">{val(salesPackage)}</SpecRow>
          <SpecRow label="Min. bestelaantal">{val(salesOrderSize)}</SpecRow>
          <SpecRow label="Levertijd">
            {deliveryDays != null ? `${deliveryDays} dagen` : '—'}
          </SpecRow>
          <SpecRow label="Land van oorsprong">{val(countryOfOrigin)}</SpecRow>
          <SpecRow label="Land van herkomst">
            {val(countryOfProvenance)}
          </SpecRow>
          <SpecRow label="CITES">{formatBool(citesListed)}</SpecRow>
          <SpecRow label="Fyto">{formatBool(fytoListed)}</SpecRow>
          <SpecRow label="Plantenpaspoort">{val(plantPassport)}</SpecRow>
          <SpecRow label="GTIN">{val(gtin)}</SpecRow>
          <SpecRow label="HS-code">{val(hsCode)}</SpecRow>
          <SpecRow label="HS-code UK">{val(hsCodeUk)}</SpecRow>
        </div>
      </details>

      <p className="mt-8 border-t border-stera-ink/10 pt-4 text-xs text-stera-ink/45">
        Laatst gewijzigd bij leverancier: {formatDateTime(sysmodified)} ·
        Laatst gesynct: {formatDateTime(syncedAt)}
      </p>
    </main>
  )
}
