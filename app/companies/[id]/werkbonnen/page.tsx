/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Breadcrumbs } from '@/components/breadcrumbs'
import {
  formatDay,
  woStatusClass,
  woStatusLabel,
} from '@/lib/company-labels'

export default async function CompanyWorkOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const sp = searchParams ? await searchParams : {}
  const tab = sp.tab === 'done' ? 'done' : 'open'

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
  const from = encodeURIComponent(`${base}/werkbonnen?tab=${tab}`)

  const { data: visits } = await supabase
    .from('maintenance_visits')
    .select('id, title, scheduled_start')
    .eq('company_id', id)

  const visitMap = new Map(
    (visits ?? []).map((v: any) => [v.id, v as { id: string; title: string | null; scheduled_start: string | null }])
  )
  const visitIds = [...visitMap.keys()]

  let workOrders: any[] = []
  if (visitIds.length > 0) {
    const { data: wo } = await supabase
      .from('work_orders')
      .select(
        'id, status, reference_number, signed_name, signed_at, created_at, visit_id'
      )
      .in('visit_id', visitIds)
      .order('created_at', { ascending: false })
    workOrders = wo ?? []
  }

  const open = workOrders.filter((w) =>
    ['draft', 'sent', 'signed'].includes(w.status)
  )
  const done = workOrders.filter((w) =>
    ['invoiced', 'archived', 'cancelled'].includes(w.status)
  )
  const list = tab === 'done' ? done : open

  return (
    <main className="stera-page-pb bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <Breadcrumbs
          items={[
            { label: 'Klanten', href: '/companies' },
            { label: company.name, href: base },
            { label: 'Werkbonnen & facturen' },
          ]}
        />

        <div>
          <h1 className="font-serif text-3xl text-stera-green">
            Werkbonnen &amp; facturen
          </h1>
          <p className="mt-1 text-sm text-stera-ink-soft">
            Pipeline voor {company.name}: versturen → tekenen → factureren
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`${base}/werkbonnen?tab=open`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === 'open'
                ? 'bg-stera-green text-white'
                : 'border border-stera-line bg-white text-stera-ink'
            }`}
          >
            Open ({open.length})
          </Link>
          <Link
            href={`${base}/werkbonnen?tab=done`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === 'done'
                ? 'bg-stera-green text-white'
                : 'border border-stera-line bg-white text-stera-ink'
            }`}
          >
            Afgerond ({done.length})
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stera-line p-6 text-center text-sm text-stera-ink-soft">
            {tab === 'open'
              ? 'Geen openstaande werkbonnen voor deze klant.'
              : 'Nog geen afgeronde werkbonnen.'}
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((w) => {
              const visit = w.visit_id ? visitMap.get(w.visit_id) : null
              return (
                <li key={w.id}>
                  <Link
                    href={`/work-orders/${w.id}?from=${from}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stera-ink">
                        {w.reference_number || 'Werkbon'}
                        {visit?.title ? (
                          <span className="font-normal text-stera-ink-soft">
                            {' '}
                            · {visit.title}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-stera-ink-soft">
                        {w.signed_at
                          ? `Getekend ${formatDay(w.signed_at)}`
                          : `Aangemaakt ${formatDay(w.created_at)}`}
                        {w.signed_name ? ` · ${w.signed_name}` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${woStatusClass(w.status)}`}
                    >
                      {woStatusLabel(w.status)}
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
