/**
 * Detailpagina voor één Nieuwkoop-artikel uit de catalogus.
 * Toont alle relevante info uit de gesyncte data + de marge-info uit
 * de view.
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

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-stera-ink/5 py-1 last:border-0">
      <span className="text-stera-ink/60">{label}</span>
      <span className="text-right text-stera-ink">{children}</span>
    </div>
  )
}

export default async function CatalogItemPage({
  params,
}: {
  params: Promise<{ itemcode: string }>
}) {
  const { itemcode } = await params

  // Twee parallelle queries: de ruwe Nieuwkoop-data en de marge-cijfers.
  const [{ data: item }, { data: margin }] = await Promise.all([
    supabase
      .from('nieuwkoop_products')
      .select('*')
      .eq('itemcode', itemcode)
      .maybeSingle(),
    supabase
      .from('v_nieuwkoop_with_margin')
      .select('cost_price, effective_margin_factor, suggested_sale_price')
      .eq('itemcode', itemcode)
      .maybeSingle(),
  ])

  if (!item) notFound()

  const r = item as Record<string, unknown>
  const m = (margin ?? {}) as Record<string, unknown>
  const isPot = r.product_group_code === '300'
  const tags = Array.isArray(r.tags) ? (r.tags as string[]) : []

  const backHref = isPot ? '/catalog?kind=pot' : '/catalog'

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <Link
        href={backHref}
        className="text-sm text-stera-ink/70 underline hover:text-stera-green"
      >
        ← Terug naar catalogus
      </Link>

      <div className="mt-4 grid gap-6 sm:grid-cols-[260px_1fr]">
        {/* Foto */}
        <div className="aspect-square overflow-hidden rounded-xl border border-stera-ink/10 bg-stera-cream/40">
          {r.item_picture_name ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/nieuwkoop/image/${itemcode}`}
              alt={(r.description as string) || itemcode}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-stera-ink/30">
              Geen foto
            </div>
          )}
        </div>

        {/* Header */}
        <div>
          <p className="stera-eyebrow mb-1 text-stera-green">
            {val(r.product_group_description_nl)}
          </p>
          <h1 className="text-3xl font-bold text-stera-ink">
            {val(r.description)}
          </h1>
          {r.item_description_nl &&
          r.item_description_nl !== r.description ? (
            <p className="mt-2 text-stera-ink/80">
              {r.item_description_nl as string}
            </p>
          ) : null}
          <p className="mt-2 font-mono text-xs text-stera-ink/50">
            {itemcode}
          </p>
          {tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
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
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="stera-card">
          <p className="stera-eyebrow mb-2 text-stera-green">Prijs</p>
          <div className="grid gap-0 text-sm">
            <Row label="Inkoopprijs (Nieuwkoop)">
              {formatPrice(
                (m.cost_price as number | null) ??
                  (r.sales_price as number | null)
              )}
            </Row>
            <Row label="Marge-factor">
              {m.effective_margin_factor != null
                ? `× ${Number(m.effective_margin_factor).toFixed(2)}`
                : '—'}
            </Row>
            <Row label="Voorgestelde verkoopprijs">
              {formatPrice(m.suggested_sale_price as number | null)}
            </Row>
          </div>
        </section>

        <section className="stera-card">
          <p className="stera-eyebrow mb-2 text-stera-green">Afmetingen</p>
          <div className="grid gap-0 text-sm">
            <Row label="Ø diameter">
              {formatCm(r.diameter as number | null)}
            </Row>
            <Row label="Hoogte">{formatCm(r.height as number | null)}</Row>
            <Row label="Breedte">{formatCm(r.width as number | null)}</Row>
            <Row label="Diepte">{formatCm(r.depth as number | null)}</Row>
            <Row label="Lengte">{formatCm(r.length as number | null)}</Row>
            <Row label="Opening">
              {formatCm(r.opening as number | null)}
            </Row>
            <Row label="Gewicht">{formatGr(r.weight as number | null)}</Row>
          </div>
        </section>

        <section className="stera-card">
          <p className="stera-eyebrow mb-2 text-stera-green">Pot-info</p>
          <div className="grid gap-0 text-sm">
            <Row label="Pot-maat (code)">{val(r.pot_size)}</Row>
            <Row label="Ø cultuurpot">
              {formatCm(r.diameter_culture_pot as number | null)}
            </Row>
            <Row label="H cultuurpot">
              {formatCm(r.height_culture_pot as number | null)}
            </Row>
          </div>
        </section>

        <section className="stera-card">
          <p className="stera-eyebrow mb-2 text-stera-green">
            Plaats &amp; gebruik
          </p>
          <div className="grid gap-0 text-sm">
            <Row label="Lichtbehoefte">{val(r.location_icon_nl)}</Row>
            <Row label="Toepassing">
              {val(r.location_usage_planters_nl)}
            </Row>
            <Row label="Variëteit">{val(r.item_variety_nl)}</Row>
            <Row label="Hoofdgroep">
              {val(r.main_group_description_nl)}
            </Row>
            <Row label="Subgroep">{val(r.group_description_nl)}</Row>
          </div>
        </section>

        <section className="stera-card">
          <p className="stera-eyebrow mb-2 text-stera-green">
            Voorraad &amp; levering
          </p>
          <div className="grid gap-0 text-sm">
            <Row label="Op voorraad">
              {formatBool(r.is_stock_item as boolean | null)}
            </Row>
            <Row label="Magazijn">{val(r.warehouse)}</Row>
            <Row label="Verpakking">{val(r.sales_package_nl)}</Row>
            <Row label="Min. bestelaantal">{val(r.sales_order_size)}</Row>
            <Row label="Levertijd">
              {r.delivery_time_in_days != null
                ? `${r.delivery_time_in_days} dagen`
                : '—'}
            </Row>
            <Row label="Per pallet">{val(r.quantity_pallet)}</Row>
            <Row label="Per kar">{val(r.quantity_trolley)}</Row>
            <Row label="In aanbieding">
              {formatBool(r.is_offer as boolean | null)}
            </Row>
            <Row label="Op website">
              {formatBool(r.show_on_website as boolean | null)}
            </Row>
            <Row label="Status">{val(r.item_status)}</Row>
          </div>
        </section>

        <section className="stera-card">
          <p className="stera-eyebrow mb-2 text-stera-green">
            Herkomst &amp; codes
          </p>
          <div className="grid gap-0 text-sm">
            <Row label="Land van oorsprong">
              {val(r.country_of_origin)}
            </Row>
            <Row label="Land van herkomst">
              {val(r.country_of_provenance)}
            </Row>
            <Row label="CITES-vermelding">
              {formatBool(r.cites_listed as boolean | null)}
            </Row>
            <Row label="Fyto-vermelding">
              {formatBool(r.fyto_listed as boolean | null)}
            </Row>
            <Row label="Plantenpaspoort">
              {val(r.plant_passport_code)}
            </Row>
            <Row label="GTIN">{val(r.gtin_code)}</Row>
            <Row label="HS-code">{val(r.hs_code)}</Row>
            <Row label="HS-code UK">{val(r.hs_code_uk)}</Row>
          </div>
        </section>
      </div>

      <p className="mt-6 text-xs text-stera-ink/50">
        Laatst gewijzigd bij Nieuwkoop:{' '}
        {formatDateTime(r.sysmodified as string | null)} · Laatst gesynct:{' '}
        {formatDateTime(r.synced_at as string | null)}
      </p>
    </main>
  )
}
