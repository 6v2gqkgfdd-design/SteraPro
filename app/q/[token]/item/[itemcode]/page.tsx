/**
 * Publieke plant-/combinatie-detail voor de klant — bereikbaar vanuit
 * de offerte op /q/[token].
 *
 * Beveiliging: we controleren of de quote-token geldig is en niet
 * geannuleerd voor we de productdetails tonen. Zo kunnen alleen mensen
 * met een geldige offerte-link de catalogus-info opvragen.
 *
 * White-label: we tonen GEEN inkoopprijs, margefactor of andere
 * Stera-interne velden. Alleen de info die de klant relevant vindt:
 * foto, beschrijving, afmetingen, lichtbehoefte, verkoopprijs.
 */

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SteraLogo from '@/components/stera-logo'

export const dynamic = 'force-dynamic'

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink flex flex-col">
      <header className="px-5 py-5 sm:px-10 sm:py-8 border-b border-stera-line">
        <SteraLogo variant="default" href={null} />
      </header>
      <div className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </div>
      <footer className="px-5 py-5 sm:px-10 text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera Pro · Plantbeheer voor professionals
      </footer>
    </main>
  )
}

export default async function PublicItemDetailPage({
  params,
}: {
  params: Promise<{ token: string; itemcode: string }>
}) {
  const { token, itemcode } = await params
  const supabase = await createClient()

  // 1) Eerst de quote-token verifiëren — anders mag deze pagina niet
  //    bekeken worden (we gebruiken dezelfde RPC die ook de quote
  //    teruggeeft; null = token ongeldig of quote geannuleerd).
  const { data: quoteData, error: quoteError } = await supabase.rpc(
    'get_quote_for_signing',
    { _token: token }
  )

  if (quoteError || !quoteData) {
    return (
      <Shell>
        <div>
          <p className="stera-eyebrow text-stera-green mb-3">Plant</p>
          <h1 className="text-3xl font-bold mb-3">
            Deze link is niet (meer) geldig
          </h1>
          <p className="text-base text-stera-ink-soft">
            Vraag Stera Pro om je een nieuwe offerte-link te bezorgen.
          </p>
        </div>
      </Shell>
    )
  }

  // 2) Productdetails ophalen via dezelfde view + raw tabel als de
  //    interne catalogus-pagina.
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

  if (!viewItem && !rawItem) {
    return (
      <Shell>
        <p className="stera-eyebrow text-stera-green mb-3">Plant</p>
        <h1 className="text-3xl font-bold mb-3">
          Plant niet gevonden
        </h1>
        <Link
          href={`/q/${token}`}
          className="text-stera-green underline-offset-4 hover:underline"
        >
          ← Terug naar offerte
        </Link>
      </Shell>
    )
  }

  const v = (viewItem ?? {}) as Record<string, unknown>
  const r = (rawItem ?? {}) as Record<string, unknown>
  const get = (key: string): unknown =>
    v[key] !== undefined ? v[key] : r[key]

  const description =
    (get('description') as string | null) || itemcode || 'Plant'
  const itemDescriptionNl = get('item_description_nl') as string | null
  const itemVariety = get('item_variety_nl') as string | null

  const photoSrc = (get('item_picture_name') as string | null)
    ? `/api/nieuwkoop/image/${encodeURIComponent(itemcode)}`
    : null

  const height = get('height') as number | null
  const diameter = get('diameter') as number | null
  const diameterCulturePot = get('diameter_culture_pot') as number | null
  const heightCulturePot = get('height_culture_pot') as number | null
  const potSize = get('pot_size') as string | null
  const opening = get('opening') as number | null
  const width = get('width') as number | null
  const depth = get('depth') as number | null
  const length = get('length') as number | null
  const weight = get('weight') as number | null

  const suggestedPrice = get('suggested_sale_price') as number | null

  const locationIcon = get('location_icon_nl') as string | null
  const locationUsage = get('location_usage_planters_nl') as string | null
  const leafSize = (r['LeafSize'] as string | null) ?? null
  const countryOfOrigin = get('country_of_origin') as string | null

  return (
    <Shell>
      {/* Breadcrumb */}
      <Link
        href={`/q/${token}`}
        className="text-sm text-stera-ink-soft hover:text-stera-green hover:underline"
      >
        ← Terug naar offerte
      </Link>

      {/* Titel */}
      <div className="mt-4">
        <h1 className="text-3xl font-bold leading-tight text-stera-ink sm:text-4xl">
          {description}
        </h1>
        {itemVariety ? (
          <p className="mt-1 text-sm text-stera-ink/60">{itemVariety}</p>
        ) : null}
      </div>

      {/* Foto + stats */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="aspect-square overflow-hidden rounded-xl border border-stera-ink/10 bg-stera-cream/40">
          {photoSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
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
          <div className="overflow-hidden rounded-xl border border-stera-ink/10 bg-white">
            <SpecRow label="Hoogte">{formatCm(height)}</SpecRow>
            {diameter && diameter > 0 ? (
              <SpecRow label="Diameter pot">{formatCm(diameter)}</SpecRow>
            ) : null}
            {length && length > 0 ? (
              <SpecRow label="Lengte pot">{formatCm(length)}</SpecRow>
            ) : null}
            {width && width > 0 ? (
              <SpecRow label="Breedte pot">{formatCm(width)}</SpecRow>
            ) : null}
            {diameterCulturePot && diameterCulturePot > 0 ? (
              <SpecRow label="Diameter plantenbak">
                {formatCm(diameterCulturePot)}
              </SpecRow>
            ) : null}
            {locationIcon ? (
              <SpecRow label="Lichtbehoefte">{locationIcon}</SpecRow>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-stera-green/30 bg-stera-green/5">
            <SpecRow label="Prijs">
              <span className="font-semibold text-stera-green">
                {formatPrice(suggestedPrice)}
              </span>
            </SpecRow>
          </div>
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
            <SpecRow label="Hoogte">{formatCm(height)}</SpecRow>
            <SpecRow label="Hoogte plantenbak">
              {formatCm(heightCulturePot)}
            </SpecRow>
            {diameter && diameter > 0 ? (
              <SpecRow label="Diameter pot">{formatCm(diameter)}</SpecRow>
            ) : null}
            {length && length > 0 ? (
              <SpecRow label="Lengte pot">{formatCm(length)}</SpecRow>
            ) : null}
            {width && width > 0 ? (
              <SpecRow label="Breedte pot">{formatCm(width)}</SpecRow>
            ) : null}
            {depth && depth > 0 ? (
              <SpecRow label="Diepte pot">{formatCm(depth)}</SpecRow>
            ) : null}
            {diameterCulturePot && diameterCulturePot > 0 ? (
              <SpecRow label="Diameter plantenbak">
                {formatCm(diameterCulturePot)}
              </SpecRow>
            ) : null}
            {opening && opening > 0 ? (
              <SpecRow label="Opening">{formatCm(opening)}</SpecRow>
            ) : null}
            {potSize ? (
              <SpecRow label="Potmaat">{val(potSize)}</SpecRow>
            ) : null}
            {weight && weight > 0 ? (
              <SpecRow label="Gewicht">{formatGr(weight * 1000)}</SpecRow>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stera-ink">
            Eigenschappen
          </h2>
          <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {itemVariety ? (
              <SpecRow label="Beplantingssysteem">{val(itemVariety)}</SpecRow>
            ) : null}
            {locationIcon ? (
              <SpecRow label="Lichtbehoefte">{val(locationIcon)}</SpecRow>
            ) : null}
            {locationUsage ? (
              <SpecRow label="Plaatsing">{val(locationUsage)}</SpecRow>
            ) : null}
            {leafSize ? (
              <SpecRow label="Bladgrootte">{val(leafSize)}</SpecRow>
            ) : null}
            {countryOfOrigin ? (
              <SpecRow label="Herkomstland">{val(countryOfOrigin)}</SpecRow>
            ) : null}
          </div>
        </section>
      </div>
    </Shell>
  )
}
