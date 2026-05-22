import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Offertes',
}

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

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format((cents ?? 0) / 100)
}

function one<T>(value: T[] | T | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

type ProposalVisit = {
  visitId: string
  title: string | null
  companyName: string | null
  locationName: string | null
  date: string | null
  plantCount: number
}

export default async function QuotesPage() {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

  // Drie onafhankelijke queries — parallel ophalen scheelt laadtijd.
  // Een plant telt als "te vervangen" wanneer ze expliciet aangevinkt
  // is (followup_replace) óf als ze als dood geregistreerd staat.
  const [
    { data: flaggedRows },
    { data: quotedVisitRows },
    { data: quotes },
  ] = await Promise.all([
    supabase
      .from('maintenance_visit_plants')
      .select(
        `
        id, visit_id,
        maintenance_visits (
          id, title, scheduled_start, ended_at, status,
          companies ( name ),
          locations ( name )
        )
      `
      )
      .eq('followup_replace', true),
    supabase
      .from('quotes')
      .select('source_visit_id')
      .not('source_visit_id', 'is', null),
    supabase
      .from('quotes')
      .select(
        `
        id, reference_number, status, customer_name, subtotal_cents,
        created_at, valid_until,
        companies ( name ),
        locations ( name )
      `
      )
      .order('created_at', { ascending: false }),
  ])

  const quotedVisitIds = new Set(
    (quotedVisitRows ?? [])
      .map((r: { source_visit_id: string | null }) => r.source_visit_id)
      .filter((v): v is string => Boolean(v))
  )

  const proposalMap = new Map<string, ProposalVisit>()
  for (const row of flaggedRows ?? []) {
    const visitId = (row as { visit_id: string }).visit_id
    if (!visitId || quotedVisitIds.has(visitId)) continue
    const existing = proposalMap.get(visitId)
    if (existing) {
      existing.plantCount += 1
      continue
    }
    const v = one(
      (row as { maintenance_visits: unknown }).maintenance_visits
    ) as
      | {
          title: string | null
          scheduled_start: string | null
          ended_at: string | null
          companies: unknown
          locations: unknown
        }
      | null
    if (!v) continue
    const company = one(v.companies) as { name?: string } | null
    const location = one(v.locations) as { name?: string } | null
    proposalMap.set(visitId, {
      visitId,
      title: v.title ?? null,
      companyName: company?.name ?? null,
      locationName: location?.name ?? null,
      date: v.ended_at || v.scheduled_start || null,
      plantCount: 1,
    })
  }
  const proposals = Array.from(proposalMap.values()).sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  )

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-8 sm:pt-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="stera-eyebrow text-stera-green">Offertes</p>
            <h1 className="text-2xl font-bold tracking-tight text-stera-ink sm:text-3xl">
              Offertes &amp; voorstellen
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/catalog" className="stera-cta stera-cta-ghost">
              Catalogus
            </Link>
            <Link href="/quotes/new" className="stera-cta stera-cta-primary">
              + Nieuwe offerte
            </Link>
          </div>
        </div>

        {/* Voorstellen uit onderhoud */}
        <section className="space-y-3">
          <div>
            <p className="stera-eyebrow text-stera-green">
              Voorstellen uit onderhoud
            </p>
            <p className="text-sm text-stera-ink-soft">
              Onderhoudsbeurten met planten die vervangen moeten worden, en
              waarvoor nog geen offerte bestaat.
            </p>
          </div>

          {proposals.length === 0 ? (
            <div className="stera-card text-sm text-stera-ink-soft">
              Geen openstaande voorstellen. Markeer een plant tijdens het
              onderhoud als &ldquo;Vervangen&rdquo; en ze verschijnt hier.
            </div>
          ) : (
            <ul className="grid gap-3">
              {proposals.map((p) => (
                <li key={p.visitId}>
                  <Link
                    href={`/quotes/new?visit=${p.visitId}`}
                    className="stera-card block transition hover:border-stera-green"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stera-ink">
                          {p.companyName || 'Onbekende klant'}
                        </p>
                        <p className="mt-1 text-sm text-stera-ink-soft">
                          {[p.locationName, p.title]
                            .filter(Boolean)
                            .join(' · ') || 'Onderhoudsbeurt'}
                        </p>
                        {p.date ? (
                          <p className="mt-1 text-xs text-stera-ink-soft">
                            Onderhoud: {formatDate(p.date)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="rounded-full bg-stera-green/10 px-3 py-1 text-xs font-semibold text-stera-green">
                          {p.plantCount} plant
                          {p.plantCount === 1 ? '' : 'en'} te vervangen
                        </span>
                        <span className="text-sm font-medium text-stera-green">
                          Maak offerte →
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Bestaande offertes */}
        <section className="space-y-3">
          <p className="stera-eyebrow text-stera-green">Alle offertes</p>

          {!quotes || quotes.length === 0 ? (
            <div className="stera-empty">
              <p className="stera-empty-title">Nog geen offertes</p>
              <p className="text-sm">
                Maak een offerte vanuit een voorstel hierboven of via
                &ldquo;Nieuwe offerte&rdquo;.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {quotes.map((q: Record<string, unknown>) => {
                const status = (q.status as QuoteStatus) || 'draft'
                const company = one(q.companies) as { name?: string } | null
                const location = one(q.locations) as { name?: string } | null
                const subtitle = [
                  company?.name,
                  location?.name,
                  q.customer_name as string | null,
                ]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li key={q.id as string}>
                    <Link
                      href={`/quotes/${q.id as string}`}
                      className="stera-card block transition hover:border-stera-green"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-stera-ink">
                            {(q.reference_number as string) || 'Offerte'}
                          </p>
                          {subtitle ? (
                            <p className="mt-1 text-sm text-stera-ink-soft">
                              {subtitle}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-stera-ink-soft">
                            {formatDate(q.created_at as string)}
                            {q.valid_until
                              ? ` · geldig tot ${formatDate(
                                  q.valid_until as string
                                )}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                              QUOTE_STATUS_TONE[status]
                            }`}
                          >
                            {QUOTE_STATUS_LABEL[status]}
                          </span>
                          <span className="font-semibold tabular-nums text-stera-ink">
                            {formatEuro(
                              (q.subtotal_cents as number) ?? 0
                            )}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
