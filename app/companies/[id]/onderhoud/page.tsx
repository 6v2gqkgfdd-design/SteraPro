/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Breadcrumbs } from '@/components/breadcrumbs'
import {
  formatDayTime,
  visitStatusClass,
  visitStatusLabel,
} from '@/lib/company-labels'

export default async function CompanyMaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const sp = searchParams ? await searchParams : {}
  const tab = sp.tab === 'done' ? 'done' : 'planned'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()
  if (!company) notFound()

  const base = `/companies/${company.id}`

  const { data: visits, error } = await supabase
    .from('maintenance_visits')
    .select(
      `id, title, status, scheduled_start, ended_at,
       locations ( name )`
    )
    .eq('company_id', id)
    .order('scheduled_start', { ascending: tab === 'planned' })

  const all = visits ?? []
  const planned = all.filter((v: any) =>
    ['scheduled', 'in_progress', 'paused'].includes(v.status)
  )
  const done = all.filter((v: any) =>
    ['completed', 'cancelled'].includes(v.status)
  )
  // Done: newest first
  done.sort((a: any, b: any) => {
    const ta = new Date(a.ended_at || a.scheduled_start || 0).getTime()
    const tb = new Date(b.ended_at || b.scheduled_start || 0).getTime()
    return tb - ta
  })

  const list = tab === 'done' ? done : planned

  return (
    <main className="stera-page-pb bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <Breadcrumbs
          items={[
            { label: 'Klanten', href: '/companies' },
            { label: company.name, href: base },
            { label: 'Onderhoud' },
          ]}
        />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl text-stera-green">Onderhoud</h1>
            <p className="mt-1 text-sm text-stera-ink-soft">
              Alle beurten voor {company.name}
            </p>
          </div>
          <Link
            href={`/maintenance/new?company=${company.id}`}
            className="stera-cta stera-cta-primary"
          >
            + Nieuwe afspraak
          </Link>
        </div>

        <div className="flex gap-2">
          <Link
            href={`${base}/onderhoud?tab=planned`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === 'planned'
                ? 'bg-stera-green text-white'
                : 'border border-stera-line bg-white text-stera-ink'
            }`}
          >
            Gepland ({planned.length})
          </Link>
          <Link
            href={`${base}/onderhoud?tab=done`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === 'done'
                ? 'bg-stera-green text-white'
                : 'border border-stera-line bg-white text-stera-ink'
            }`}
          >
            Gebeurd ({done.length})
          </Link>
        </div>

        {error ? (
          <p className="text-red-600">{error.message}</p>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stera-line p-6 text-center text-sm text-stera-ink-soft">
            {tab === 'planned'
              ? 'Geen geplande beurten voor deze klant.'
              : 'Nog geen voltooide of geannuleerde beurten.'}
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((v: any) => {
              const loc = Array.isArray(v.locations)
                ? v.locations[0]
                : v.locations
              return (
                <li key={v.id}>
                  <Link
                    href={`/maintenance/${v.id}?from=${encodeURIComponent(`${base}/onderhoud?tab=${tab}`)}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stera-ink">
                        {v.title || 'Onderhoud'}
                        {loc?.name ? (
                          <span className="font-normal text-stera-ink-soft">
                            {' '}
                            · {loc.name}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-stera-ink-soft">
                        {formatDayTime(v.ended_at || v.scheduled_start)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${visitStatusClass(v.status)}`}
                    >
                      {visitStatusLabel(v.status)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <Link
          href={base}
          className="inline-block text-sm font-medium text-stera-green underline-offset-4 hover:underline"
        >
          ← Terug naar {company.name}
        </Link>
      </div>
    </main>
  )
}
