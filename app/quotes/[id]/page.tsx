import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { woImage } from '@/lib/wo-image'
import { updateQuoteStatusAction } from './actions'
import ShareQuoteLink from './share-link'

type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'ordered'
  | 'expired'
  | 'cancelled'

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Concept',
  sent: 'Verstuurd',
  accepted: 'Goedgekeurd',
  declined: 'Afgewezen',
  ordered: 'Besteld',
  expired: 'Vervallen',
  cancelled: 'Geannuleerd',
}

const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = {
  draft: 'bg-amber-50 text-amber-700',
  sent: 'bg-blue-50 text-blue-700',
  accepted: 'bg-stera-green/10 text-stera-green',
  ordered: 'bg-stera-green text-white',
  declined: 'bg-red-50 text-red-700',
  expired: 'bg-stera-cream-deep text-stera-ink-soft',
  cancelled: 'bg-stera-cream-deep text-stera-ink-soft',
}

const LINE_TYPE_LABEL: Record<string, string> = {
  combination: 'Combinatie',
  plant: 'Plant',
  outer_pot: 'Buitenpot',
  custom: 'Vrije regel',
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format((cents ?? 0) / 100)
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function one<T>(value: T[] | T | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

  // Beide queries zijn onafhankelijk → parallel ophalen.
  const [
    { data: quote, error },
    { data: lines },
  ] = await Promise.all([
    supabase
      .from('quotes')
      .select(
        `
      id, reference_number, status, intro_note, valid_until, created_at,
      accepted_at, declined_at, signing_token,
      customer_name, customer_email, subtotal_cents,
      companies ( name ),
      locations ( name )
    `
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('quote_lines')
      .select(
        `id, line_type, name, description, spec, image_url,
       unit_price_cents, quantity, line_total_cents, position`
      )
      .eq('quote_id', id)
      .order('position', { ascending: true }),
  ])

  if (error || !quote) {
    notFound()
  }

  const status = (quote.status as QuoteStatus) || 'draft'
  const company = one(quote.companies) as { name?: string } | null
  const location = one(quote.locations) as { name?: string } | null
  const subtitle = [company?.name, location?.name, quote.customer_name]
    .filter(Boolean)
    .join(' · ')

  const subtotal =
    (lines ?? []).reduce(
      (sum: number, l: Record<string, unknown>) =>
        sum + ((l.line_total_cents as number) ?? 0),
      0
    ) || (quote.subtotal_cents as number) || 0

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-8 sm:pt-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          href="/quotes"
          className="inline-block text-sm text-stera-ink-soft underline-offset-2 hover:text-stera-green hover:underline"
        >
          ← Alle offertes
        </Link>

        <div className="stera-card space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="stera-eyebrow text-stera-green">Offerte</p>
              <h1 className="text-2xl font-bold tracking-tight text-stera-ink">
                {quote.reference_number || 'Offerte'}
              </h1>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${QUOTE_STATUS_TONE[status]}`}
            >
              {QUOTE_STATUS_LABEL[status]}
            </span>
          </div>
          {subtitle ? (
            <p className="text-sm text-stera-ink-soft">{subtitle}</p>
          ) : null}
          {quote.customer_email ? (
            <p className="text-sm text-stera-ink-soft">
              {quote.customer_email as string}
            </p>
          ) : null}
          <p className="text-xs text-stera-ink-soft">
            Opgemaakt op {formatDate(quote.created_at as string)}
            {quote.valid_until
              ? ` · geldig tot ${formatDate(quote.valid_until as string)}`
              : ''}
          </p>
        </div>

        {/* Status & acties */}
        <div className="stera-card flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="stera-eyebrow text-stera-green mb-1">Status</p>
            <p className="text-sm text-stera-ink-soft">
              {status === 'draft' && 'Concept — nog niet verstuurd.'}
              {status === 'sent' &&
                'Verstuurd — wacht op antwoord van de klant.'}
              {status === 'accepted' &&
                `Goedgekeurd${
                  quote.accepted_at
                    ? ` op ${formatDate(quote.accepted_at as string)}`
                    : ''
                }.`}
              {status === 'declined' &&
                `Afgewezen${
                  quote.declined_at
                    ? ` op ${formatDate(quote.declined_at as string)}`
                    : ''
                }.`}
              {(status === 'ordered' ||
                status === 'expired' ||
                status === 'cancelled') &&
                QUOTE_STATUS_LABEL[status]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {status === 'draft' && (
              <form action={updateQuoteStatusAction}>
                <input
                  type="hidden"
                  name="quote_id"
                  value={quote.id as string}
                />
                <input type="hidden" name="status" value="sent" />
                <button type="submit" className="stera-cta stera-cta-primary">
                  Markeer als verstuurd
                </button>
              </form>
            )}
            {status === 'sent' && (
              <>
                <form action={updateQuoteStatusAction}>
                  <input
                    type="hidden"
                    name="quote_id"
                    value={quote.id as string}
                  />
                  <input type="hidden" name="status" value="accepted" />
                  <button
                    type="submit"
                    className="stera-cta stera-cta-primary"
                  >
                    Markeer als goedgekeurd
                  </button>
                </form>
                <form action={updateQuoteStatusAction}>
                  <input
                    type="hidden"
                    name="quote_id"
                    value={quote.id as string}
                  />
                  <input type="hidden" name="status" value="declined" />
                  <button
                    type="submit"
                    className="rounded-lg border border-stera-line bg-white px-3 py-2 text-sm font-medium text-stera-ink hover:border-red-300"
                  >
                    Markeer als afgewezen
                  </button>
                </form>
              </>
            )}
            {(status === 'sent' ||
              status === 'accepted' ||
              status === 'declined') && (
              <form action={updateQuoteStatusAction}>
                <input
                  type="hidden"
                  name="quote_id"
                  value={quote.id as string}
                />
                <input type="hidden" name="status" value="draft" />
                <button type="submit" className="stera-cta stera-cta-ghost">
                  Heropen als concept
                </button>
              </form>
            )}
          </div>
        </div>

        {quote.intro_note ? (
          <div className="stera-card">
            <p className="stera-eyebrow text-stera-green mb-2">
              Begeleidend bericht
            </p>
            <p className="whitespace-pre-wrap text-sm text-stera-ink">
              {quote.intro_note as string}
            </p>
          </div>
        ) : null}

        <div className="stera-card space-y-3">
          <p className="stera-eyebrow text-stera-green">Offerteregels</p>
          {!lines || lines.length === 0 ? (
            <p className="text-sm text-stera-ink-soft">Geen regels.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((l: Record<string, unknown>) => {
                const img = woImage(l.image_url as string | null)
                const qty = (l.quantity as number) || 1
                return (
                  <li
                    key={l.id as string}
                    className="flex flex-wrap gap-3 rounded-xl border border-stera-line bg-white p-3"
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt={(l.name as string) || ''}
                        className="h-16 w-16 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-[10px] text-stera-ink-soft">
                        {LINE_TYPE_LABEL[l.line_type as string] || 'Regel'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="inline-block rounded-full bg-stera-cream-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
                        {LINE_TYPE_LABEL[l.line_type as string] || 'Regel'}
                      </span>
                      <p className="mt-1 text-sm font-medium text-stera-ink">
                        {l.name as string}
                      </p>
                      {l.spec ? (
                        <p className="text-xs text-stera-ink-soft">
                          {l.spec as string}
                        </p>
                      ) : null}
                      {l.description ? (
                        <p className="text-xs text-stera-ink-soft">
                          {l.description as string}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-stera-ink-soft">
                        {qty} × {formatEuro((l.unit_price_cents as number) ?? 0)}
                      </p>
                      <p className="font-semibold tabular-nums text-stera-ink">
                        {formatEuro((l.line_total_cents as number) ?? 0)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex items-baseline justify-between border-t border-stera-line pt-3">
            <span className="stera-eyebrow text-stera-green">
              Totaal (excl. btw)
            </span>
            <span className="text-xl font-bold tabular-nums text-stera-ink">
              {formatEuro(subtotal)}
            </span>
          </div>
        </div>

        {/* Publieke deel-link voor de klant */}
        {quote.signing_token ? (
          <ShareQuoteLink token={quote.signing_token as string} />
        ) : null}

        {/* Webshop-doorverwijzing — nog in opbouw */}
        <div className="stera-card flex flex-wrap items-center justify-between gap-3 border-dashed opacity-80">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stera-ink">
              Naar de webshop bestellen
            </p>
            <p className="text-xs text-stera-ink-soft">
              Binnenkort kan de klant deze planten rechtstreeks in de
              webshop aanpassen, aanvullen en afrekenen.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-stera-cream-deep px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stera-ink-soft">
            In opbouw
          </span>
        </div>
      </div>
    </main>
  )
}
