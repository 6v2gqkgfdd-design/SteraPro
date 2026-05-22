import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Status = 'draft' | 'sent' | 'signed' | 'invoiced' | 'archived'

const STATUS_LABEL: Record<Status, string> = {
  draft: 'Nog te versturen',
  sent: 'Wachten op tekenen',
  signed: 'Goedgekeurd',
  invoiced: 'Gefactureerd',
  archived: 'Gearchiveerd',
}

const STATUS_TONE: Record<Status, string> = {
  draft: 'bg-amber-50 text-amber-700',
  sent: 'bg-blue-50 text-blue-700',
  signed: 'bg-stera-green/10 text-stera-green',
  invoiced: 'bg-blue-50 text-blue-800',
  archived: 'bg-stera-cream-deep text-stera-ink-soft',
}

const TAB_ORDER: Status[] = ['draft', 'sent', 'signed', 'invoiced', 'archived']

function formatDate(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const activeTab: Status = TAB_ORDER.includes(params?.tab as Status)
    ? (params!.tab as Status)
    : 'draft'

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  // Afgewerkte beurten waarvoor nog GEEN werkbon bestaat — melding
  // bovenaan om Jelle te herinneren. Contract-klanten krijgen
  // automatisch een 'archived' werkbon bij het beëindigen van de
  // beurt, dus die filteren we hier uit: voor hen is geen actie nodig.
  // Beide queries zijn onafhankelijk → parallel ophalen.
  const [{ data: rows, error }, { data: completedVisits }] =
    await Promise.all([
      supabase
        .from('work_orders')
        .select(
          `id, status, sent_at, signed_at, signed_name, created_at, reference_number,
           maintenance_visits (
             id,
             title,
             scheduled_start,
             ended_at,
             locations ( name, companies ( name ) )
           )`
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('maintenance_visits')
        .select(
          `id, title, scheduled_start, ended_at,
           locations ( name, companies ( name, has_maintenance_contract ) ),
           work_orders ( id )`
        )
        .eq('status', 'completed')
        .order('ended_at', { ascending: false }),
    ])

  const missingWorkOrder = (completedVisits ?? []).filter((v: any) => {
    // Supabase geeft work_orders soms als array, soms als object
    // (door de unique constraint op visit_id wordt het een 1-1 relatie).
    // Beide gevallen afdekken.
    const woField = v.work_orders
    const hasWorkOrder = Array.isArray(woField)
      ? woField.length > 0
      : Boolean(woField && woField.id)
    if (hasWorkOrder) return false

    const loc = Array.isArray(v.locations) ? v.locations[0] : v.locations
    const company = Array.isArray(loc?.companies)
      ? loc.companies[0]
      : loc?.companies
    if (company?.has_maintenance_contract) return false
    return true
  })

  function visitLine(row: any) {
    const v = row.maintenance_visits
    const visit = Array.isArray(v) ? v[0] : v
    if (!visit) return { title: 'Onderhoud', subtitle: '', date: '' }

    const loc = visit.locations
    const location = Array.isArray(loc) ? loc[0] : loc
    const company = Array.isArray(location?.companies)
      ? location.companies[0]
      : location?.companies

    return {
      title: visit.title || 'Onderhoud',
      subtitle: [company?.name, location?.name].filter(Boolean).join(' · '),
      date: formatDate(visit.ended_at || visit.scheduled_start),
    }
  }

  const groups: Record<Status, any[]> = {
    draft: [], sent: [], signed: [], invoiced: [], archived: [],
  }
  for (const row of rows ?? []) {
    if (row.status === 'draft') groups.draft.push(row)
    else if (row.status === 'sent') groups.sent.push(row)
    else if (row.status === 'signed') groups.signed.push(row)
    else if (row.status === 'invoiced') groups.invoiced.push(row)
    else if (row.status === 'archived') groups.archived.push(row)
  }

  const active = groups[activeTab]

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-8 sm:pt-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="sticky top-0 z-20 -mx-5 -mt-3 flex flex-wrap gap-2 bg-stera-cream/95 px-5 pt-3 pb-3 backdrop-blur sm:static sm:mx-0 sm:mt-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <Link
            href="/maintenance"
            className="rounded-full border border-stera-line bg-white px-4 py-2.5 text-sm font-medium text-stera-ink hover:border-stera-green"
          >
            ← Onderhoud
          </Link>
          {TAB_ORDER.map((s) => (
            <Link
              key={s}
              href={`/work-orders?tab=${s}`}
              className={
                activeTab === s
                  ? 'rounded-full bg-stera-green px-4 py-2.5 text-sm font-semibold text-white'
                  : 'rounded-full border border-stera-line bg-white px-4 py-2.5 text-sm font-medium text-stera-ink hover:border-stera-green'
              }
            >
              {STATUS_LABEL[s]}
              <span className="ml-2 opacity-70">{groups[s].length}</span>
            </Link>
          ))}
        </div>

        {missingWorkOrder.length > 0 ? (
          <details className="stera-card border-amber-200 bg-amber-50/60 open:bg-amber-50">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-900">
                  {missingWorkOrder.length}{' '}
                  afgewerkt onderhoud
                  {missingWorkOrder.length === 1 ? '' : 'en'}{' '}
                  zonder werkbon
                </p>
                <span className="text-xs text-amber-800 underline-offset-4 group-open:no-underline">
                  Bekijken ↓
                </span>
              </div>
            </summary>
            <ul className="mt-3 space-y-2 border-t border-amber-200 pt-3">
              {missingWorkOrder.map((v: any) => {
                const loc = Array.isArray(v.locations)
                  ? v.locations[0]
                  : v.locations
                const company = Array.isArray(loc?.companies)
                  ? loc.companies[0]
                  : loc?.companies
                const subtitle = [company?.name, loc?.name]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li key={v.id}>
                    <Link
                      href={`/maintenance/${v.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm hover:border-amber-400"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-stera-ink">
                          {v.title || 'Onderhoud'}
                        </span>
                        {subtitle ? (
                          <span className="ml-2 text-stera-ink-soft">
                            · {subtitle}
                          </span>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-stera-ink-soft">
                        {formatDate(v.ended_at || v.scheduled_start)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-xs text-amber-800">
              Klik op een beurt → daar kan je via &ldquo;Werkbon aanmaken&rdquo;
              de werkbon genereren.
            </p>
          </details>
        ) : null}

        {error ? (
          <div className="stera-card text-sm text-red-600">
            Fout bij ophalen: {error.message}
          </div>
        ) : active.length === 0 ? (
          <div className="stera-empty">
            <p className="stera-empty-title">
              {activeTab === 'draft' && 'Geen openstaande werkbonnen'}
              {activeTab === 'sent' && 'Geen werkbonnen onderweg'}
              {activeTab === 'signed' && 'Nog geen ondertekende werkbonnen'}
              {activeTab === 'invoiced' && 'Nog geen gefactureerde werkbonnen'}
              {activeTab === 'archived' && 'Nog geen gearchiveerde werkbonnen'}
            </p>
            <p className="text-sm">
              {activeTab === 'draft' &&
                'Werkbonnen verschijnen hier zodra je een onderhoud beëindigt.'}
              {activeTab === 'sent' &&
                'Werkbonnen die je naar een klant stuurde, wachten hier op handtekening.'}
              {activeTab === 'signed' &&
                'Goedgekeurde werkbonnen komen hier te staan tot je ze factureert.'}
              {activeTab === 'invoiced' &&
                'Gefactureerde werkbonnen archiveer je hier voor je administratie.'}
              {activeTab === 'archived' &&
                'Werkbonnen van contract-klanten worden automatisch gearchiveerd.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {active.map((row: any) => {
              const meta = visitLine(row)
              return (
                <li key={row.id}>
                  <Link
                    href={`/work-orders/${row.id}`}
                    className="stera-card block transition hover:border-stera-green"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stera-ink">
                          {row.reference_number || meta.title}
                        </p>
                        {meta.subtitle ? (
                          <p className="mt-1 text-sm text-stera-ink-soft">
                            {meta.subtitle}
                          </p>
                        ) : null}
                        {meta.date ? (
                          <p className="mt-1 text-xs text-stera-ink-soft">
                            {meta.date}
                          </p>
                        ) : null}
                        {row.signed_name ? (
                          <p className="mt-2 text-xs text-stera-ink-soft">
                            Getekend door {row.signed_name}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_TONE[row.status as Status]}`}
                      >
                        {STATUS_LABEL[row.status as Status]}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
