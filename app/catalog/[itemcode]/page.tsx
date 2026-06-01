/**
 * Detailpagina voor één artikel uit de catalogus.
 *
 * Layout:
 *  - Back-link + breadcrumb
 *  - Titel + artikelcode
 *  - Grote foto links / stats-blok rechts (Hoogte, Diameter,
 *    Diameter Plantenbak, voorgestelde prijs)
 *  - Drie secties onder elkaar: Beschrijving / Specificaties /
 *    Eigenschappen
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

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
  return d.toLocaleString('nl-BE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function val(v: unknown) {
  if (v == null || v === '') return '—'
  return String(v)
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

export default async function CatalogItemPage({
  params,
}: {
  params: Promise<{ itemcode: string }>
}) {
  const { itemcode } = await params

  // De view bevat de marge-cijfers. item_variety_nl en raw-velden zoals
  // item_description_nl halen we apart uit nieuwkoop_products.
  const [{ data: viewItem }, { data: rawItem }] = await Promise.all([
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
  ])

  if (!viewItem) notFound()

  const v = viewItem as Record<string, unknown>
  const r = (rawItem ?? {}) as Record<string, unknown>
  // Voor velden die in de tabel zitten maar niet in de view, val terug
  // op de raw-rij. De view-rij heeft voorrang voor wat ze beide hebben.
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

  // r.tags is een array van {Code, Values:[{Description_NL}]} — we slaan
  // het plat tot een ontdubbelde lijst leesbare labels (geen objecten als
  // React-key, anders krijg je dubbele/[object Object]-keys).
  type RawTagValue = { Description_NL?: string | null }
  type RawTag = { Code?: string | null; Values?: RawTagValue[] | null }
  const tags: string[] = Array.isArray(r.tags)
    ? Array.from(
        new Set(
          (r.tags as RawTag[]).flatMap((t) =>
            (t?.Values ?? [])
              .map((vv) => (vv?.Description_NL ?? '').trim())
              .filter(Boolean)
          )
        )
      )
    : []

  const height = get('height') as number | null
  const diameter = get('diameter') as number | null
  const diameterCulturePot = get('diameter_culture_pot') as number | null
  const heightCulturePot = get('height_culture_pot') as number | null
  const potSize = get('pot_size') as string | null
  const opening = get('opening') as number | null
  const width = get('width') as number | null
  const depth = get('depth') as number | null
  const weight = get('weight') as number | null

  const costPrice = get('cost_price') as number | null
  const marginFactor = get('effective_margin_factor') as number | null
  const suggestedPrice = get('suggested_sale_price') as number | null

  const locationIcon = get('location_icon_nl') as string | null
  const locationUsage = get('location_usage_planters_nl') as string | null
  const mainGroupDesc =
    get('main_group_description_nl') as string | null
  const subGroupDesc = get('group_description_nl') as string | null

  const isStock = get('is_stock_item') as boolean | null
  const warehouse = get('warehouse') as string | null
  const salesPackage = get('sales_package_nl') as string | null
  const salesOrderSize = get('sales_order_size') as number | string | null
  const deliveryDays = get('delivery_time_in_days') as number | null
  const quantityPallet = get('quantity_pallet') as number | null
  const quantityTrolley = get('quantity_trolley') as number | null
  const isOffer = get('is_offer') as boolean | null
  const showOnWebsite = get('show_on_website') as boolean | null
  const itemStatus = get('item_status') as string | null

  const countryOfOrigin = get('country_of_origin') as string | null
  const countryOfProvenance = get('country_of_provenance') as
    | string
    | null
  const citesListed = get('cites_listed') as boolean | null
  const fytoListed = get('fyto_listed') as boolean | null
  const plantPassport = get('plant_passport_code') as string | null
  const gtin = get('gtin_code') as string | null
  const hsCode = get('hs_code') as string | null
  const hsCodeUk = get('hs_code_uk') as string | null

  const sysmodified = get('sysmodified') as string | null
  const syncedAt = get('synced_at') as string | null

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Back + breadcrumb */}
      <Link
        href="/catalog"
        className="text-sm text-stera-ink/70 hover:text-stera-green hover:underline"
      >
        ← Back
      </Link>
      <nav
        aria-label="Breadcrumb"
        className="mt-3 text-sm text-stera-ink/60"
      >
        <Link href="/dashboard" className="hover:text-stera-green">
          Home
        </Link>
        <span className="mx-2">›</span>
        <Link href="/catalog" className="hover:text-stera-green">
          Catalogus
        </Link>
        <span className="mx-2">›</span>
        <span className="text-stera-green">{description}</span>
      </nav>

      {/* Titel */}
      <div className="mt-4">
        <h1 className="text-3xl font-bold leading-tight text-stera-ink sm:text-4xl">
          {description}
        </h1>
        <p className="mt-1 text-sm text-stera-ink/60">
          Artikelcode:{' '}
          <span className="font-mono text-stera-ink/70">{itemcode}</span>
        </p>
      </div>

      {/* Foto + stats */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="aspect-square overflow-hidden rounded-xl border border-stera-ink/10 bg-stera-cream/40">
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

        <aside className="space-y-4">
          <div>
            <p className="stera-eyebrow text-stera-green">
              {productGroupDesc}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stera-ink">
              {description}
            </h2>
            {itemVariety ? (
              <p className="text-sm text-stera-ink/60">{itemVariety}</p>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-stera-ink/10 bg-white">
            <SpecRow label="Hoogte">{formatCm(height)}</SpecRow>
            <SpecRow label="Diameter">{formatCm(diameter)}</SpecRow>
            <SpecRow label="Diameter plantenbak">
              {formatCm(diameterCulturePot)}
            </SpecRow>
            {locationIcon ? (
              <SpecRow label="Lichtbehoefte">{locationIcon}</SpecRow>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-stera-green/30 bg-stera-green/5">
            <SpecRow label="Voorgestelde verkoopprijs">
              <span className="font-semibold text-stera-green">
                {formatPrice(suggestedPrice)}
              </span>
            </SpecRow>
            <SpecRow label="Inkoopprijs (leverancier)">
              {formatPrice(costPrice)}
            </SpecRow>
            <SpecRow label="Marge-factor">
              {marginFactor != null
                ? `× ${Number(marginFactor).toFixed(2)}`
                : '—'}
            </SpecRow>
          </div>

          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-stera-cream-deep px-2 py-0.5 text-xs text-stera-ink-soft"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </aside>
      </div>

      {/* Beschrijving + specificaties + eigenschappen */}
      <div className="mt-10 space-y-10">
        {itemDescriptionNl ? (
          <section>
            <h2 className="text-xl font-semibold text-stera-ink">
              Beschrijving
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-stera-ink leading-relaxed">
              {itemDescriptionNl}
            </p>
          </section>
        ) : null}

        <section>
          <h2 className="text-xl font-semibold text-stera-ink">
            Specificaties
          </h2>
          <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stera-ink/50">
                Afmetingen
              </p>
              <SpecRow label="Hoogte">{formatCm(height)}</SpecRow>
              <SpecRow label="Diameter">{formatCm(diameter)}</SpecRow>
              <SpecRow label="Breedte">{formatCm(width)}</SpecRow>
              <SpecRow label="Diepte">{formatCm(depth)}</SpecRow>
              <SpecRow label="Opening">{formatCm(opening)}</SpecRow>
              <SpecRow label="Gewicht">{formatGr(weight)}</SpecRow>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stera-ink/50">
                Pot / cultuurpot
              </p>
              <SpecRow label="Pot-maat (code)">{val(potSize)}</SpecRow>
              <SpecRow label="Ø cultuurpot">
                {formatCm(diameterCulturePot)}
              </SpecRow>
              <SpecRow label="H cultuurpot">
                {formatCm(heightCulturePot)}
              </SpecRow>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stera-ink/50">
                Plaats &amp; gebruik
              </p>
              <SpecRow label="Lichtbehoefte">{val(locationIcon)}</SpecRow>
              <SpecRow label="Toepassing">{val(locationUsage)}</SpecRow>
              <SpecRow label="Beplantingssysteem">
                {val(itemVariety)}
              </SpecRow>
              <SpecRow label="Hoofdgroep">{val(mainGroupDesc)}</SpecRow>
              <SpecRow label="Subgroep">{val(subGroupDesc)}</SpecRow>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stera-ink/50">
                Voorraad &amp; levering
              </p>
              <SpecRow label="Op voorraad">{formatBool(isStock)}</SpecRow>
              <SpecRow label="Magazijn">{val(warehouse)}</SpecRow>
              <SpecRow label="Verpakking">{val(salesPackage)}</SpecRow>
              <SpecRow label="Min. bestelaantal">
                {val(salesOrderSize)}
              </SpecRow>
              <SpecRow label="Levertijd">
                {deliveryDays != null ? `${deliveryDays} dagen` : '—'}
              </SpecRow>
              <SpecRow label="Per pallet">{val(quantityPallet)}</SpecRow>
              <SpecRow label="Per kar">{val(quantityTrolley)}</SpecRow>
              <SpecRow label="In aanbieding">{formatBool(isOffer)}</SpecRow>
              <SpecRow label="Op website">
                {formatBool(showOnWebsite)}
              </SpecRow>
              <SpecRow label="Status">{val(itemStatus)}</SpecRow>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stera-ink">
            Eigenschappen
          </h2>
          <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <SpecRow label="Land van oorsprong">
              {val(countryOfOrigin)}
            </SpecRow>
            <SpecRow label="Land van herkomst">
              {val(countryOfProvenance)}
            </SpecRow>
            <SpecRow label="CITES-vermelding">
              {formatBool(citesListed)}
            </SpecRow>
            <SpecRow label="Fyto-vermelding">{formatBool(fytoListed)}</SpecRow>
            <SpecRow label="Plantenpaspoort">{val(plantPassport)}</SpecRow>
            <SpecRow label="GTIN">{val(gtin)}</SpecRow>
            <SpecRow label="HS-code">{val(hsCode)}</SpecRow>
            <SpecRow label="HS-code UK">{val(hsCodeUk)}</SpecRow>
          </div>
        </section>
      </div>

      <p className="mt-12 border-t border-stera-ink/10 pt-4 text-xs text-stera-ink/50">
        Laatst gewijzigd bij leverancier: {formatDateTime(sysmodified)} ·
        Laatst gesynct: {formatDateTime(syncedAt)}
      </p>
    </main>
  )
}
