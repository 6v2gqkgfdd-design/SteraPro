import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nog te versturen',
  sent: 'Wachten op goedkeuring',
  signed: 'Goedgekeurd',
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700',
  sent: 'bg-blue-50 text-blue-700',
  signed: 'bg-stera-green/10 text-stera-green',
}

function formatDate(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function WorkOrdersPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: rows, error } = await supabase
    .from('work_orders')
    .select(
      `id, status, sent_at, signed_at, signed_name, created_at,
       maintenance_visits (
         id,
         title,
         scheduled_start,
         ended_at,
         locations ( name, companies ( name ) )
       )`
    )
    .order('created_at', { ascending: false })

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

  const groups: Record<'draft' | 'sent' | 'signed', any[]> = {
    draft: [],
    sent: [],
    signed: [],
  }
  for (const row of rows ?? []) {
    if (row.status === 'draft') groups.draft.push(row)
    else if (row.status === 'sent') groups.sent.push(row)
    else if (row.status === 'signed') groups.signed.push(row)
  }

  return (
    <main className="bg-stera-cream px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="stera-display text-3xl sm:text-4xl">Werkbonnen</h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Werkbonnen worden automatisch aangemaakt zodra je een onderhoud
            beëindigt. Verstuur ze naar de klant en wacht op de digitale
            handtekening.
          </p>
        </div>

        {error ? (
          <div className="stera-card text-sm text-red-600">
            Fout bij ophalen: {error.message}
          </div>
        ) : null}

        {(['draft', 'sent', 'signed'] as const).map((status) => {
          const list = groups[status]
          return (
            <section key={status} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="stera-eyebrow">{STATUS_LABEL[status]}</p>
                <p className="text-xs text-stera-ink-soft">
                  {list.length === 0
                    ? 'Geen items'
                    : list.length === 1
                      ? '1 werkbon'
                      : `${list.length} werkbonnen`}
                </p>
              </div>

              {list.length === 0 ? (
                <div className="stera-card text-sm text-stera-ink-soft">
                  {status === 'draft' && 'Geen openstaande werkbonnen.'}
                  {status === 'sent' &&
                    'Geen werkbonnen wachtend op de klant.'}
                  {status === 'signed' &&
                    'Nog geen ondertekende werkbonnen.'}
                </div>
              ) : (
                <ul className="space-y-3">
                  {list.map((row: any) => {
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
                                {meta.title}
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
                              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_TONE[row.status]}`}
                            >
                              {STATUS_LABEL[row.status]}
                            </span>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}
