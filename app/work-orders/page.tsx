import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Status = 'draft' | 'sent' | 'signed' | 'archived'

const STATUS_LABEL: Record<Status, string> = {
  draft: 'Nog te versturen',
  sent: 'Wachten op tekenen',
  signed: 'Goedgekeurd',
  archived: 'Gearchiveerd',
}

const STATUS_TONE: Record<Status, string> = {
  draft: 'bg-amber-50 text-amber-700',
  sent: 'bg-blue-50 text-blue-700',
  signed: 'bg-stera-green/10 text-stera-green',
  archived: 'bg-stera-cream-deep text-stera-ink-soft',
}

const TAB_ORDER: Status[] = ['draft', 'sent', 'signed', 'archived']

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

  const groups: Record<Status, any[]> = {
    draft: [], sent: [], signed: [], archived: [],
  }
  for (const row of rows ?? []) {
    if (row.status === 'draft') groups.draft.push(row)
    else if (row.status === 'sent') groups.sent.push(row)
    else if (row.status === 'signed') groups.signed.push(row)
    else if (row.status === 'archived') groups.archived.push(row)
  }

  const active = groups[activeTab]

  return (
    <main className="bg-stera-cream px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap gap-2">
          {TAB_ORDER.map((s) => (
            <Link
              key={s}
              href={`/work-orders?tab=${s}`}
              className={
                activeTab === s
                  ? 'rounded-full bg-stera-green px-4 py-1.5 text-sm font-semibold text-white'
                  : 'rounded-full border border-stera-line bg-white px-4 py-1.5 text-sm font-medium text-stera-ink hover:border-stera-green'
              }
            >
              {STATUS_LABEL[s]}
              <span className="ml-2 opacity-70">{groups[s].length}</span>
            </Link>
          ))}
        </div>

        {error ? (
          <div className="stera-card text-sm text-red-600">
            Fout bij ophalen: {error.message}
          </div>
        ) : active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stera-line p-6 text-center text-sm text-stera-ink-soft">
            {activeTab === 'draft' && 'Geen openstaande werkbonnen.'}
            {activeTab === 'sent' && 'Geen werkbonnen wachtend op de klant.'}
            {activeTab === 'signed' && 'Nog geen ondertekende werkbonnen.'}
            {activeTab === 'archived' && 'Nog geen gearchiveerde werkbonnen.'}
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
