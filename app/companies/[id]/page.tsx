/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteCompanyButton from '@/components/delete-company-button'
import { RowMenu, RowMenuItem } from '@/components/row-menu'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { formatDay } from '@/lib/company-labels'

function OverviewCard({
  label,
  value,
  href,
  hint,
}: {
  label: string
  value: number | string
  href?: string
  hint?: string
}) {
  const inner = (
    <div className="h-full rounded-xl border border-stera-line bg-white p-3">
      <p className="font-serif text-3xl leading-none text-stera-green">{value}</p>
      <p className="mt-1.5 text-xs font-medium text-stera-ink-soft">{label}</p>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-stera-ink-soft/70">{hint}</p>
      ) : null}
    </div>
  )
  return href ? (
    <Link href={href} className="block transition hover:border-stera-green hover:opacity-90">
      {inner}
    </Link>
  ) : (
    inner
  )
}

export default async function CompanyDetailPage({
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

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (companyError || !company) {
    notFound()
  }

  const base = `/companies/${company.id}`

  const [
    { data: locations, error: locationsError },
    { data: visits },
    { count: plantsCount },
    { data: orders },
  ] = await Promise.all([
    supabase
      .from('locations')
      .select('*')
      .eq('company_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('maintenance_visits')
      .select('id, status, scheduled_start, ended_at, title')
      .eq('company_id', id)
      .order('scheduled_start', { ascending: false }),
    supabase
      .from('plants')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', id),
    supabase
      .from('shopify_orders')
      .select('id, delivery_status, name, scheduled_start')
      .eq('company_id', id),
  ])

  const visitIds = (visits ?? []).map((v: any) => v.id)
  const plannedVisits = (visits ?? []).filter((v: any) =>
    ['scheduled', 'in_progress', 'paused'].includes(v.status)
  )
  const completedVisits = (visits ?? []).filter((v: any) =>
    ['completed', 'cancelled'].includes(v.status)
  )

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

  const openWo = {
    draft: workOrders.filter((w) => w.status === 'draft'),
    sent: workOrders.filter((w) => w.status === 'sent'),
    signed: workOrders.filter((w) => w.status === 'signed'),
  }
  const invoicedCount = workOrders.filter((w) => w.status === 'invoiced').length

  const orderList = orders ?? []
  const openOrders = orderList.filter((o: any) =>
    ['unscheduled', 'scheduled', 'in_progress'].includes(o.delivery_status)
  )
  const unscheduledOrders = orderList.filter(
    (o: any) => o.delivery_status === 'unscheduled'
  )

  const hasOpenActions =
    openWo.draft.length > 0 ||
    openWo.sent.length > 0 ||
    openWo.signed.length > 0 ||
    plannedVisits.length > 0 ||
    unscheduledOrders.length > 0

  return (
    <main className="stera-page-pb bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        {/* Header */}
        <div className="space-y-2">
          <Breadcrumbs
            items={[
              { label: 'Klanten', href: '/companies' },
              { label: company.name },
            ]}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-3xl leading-none text-stera-green sm:text-4xl">
                  {company.name}
                </h1>
                {company.has_maintenance_contract ? (
                  <span className="rounded-full bg-stera-green/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-stera-green">
                    Contract
                  </span>
                ) : null}
              </div>
              {(company.contact_name || company.email || company.phone) && (
                <p className="mt-1 text-sm text-stera-ink-soft">
                  {[company.contact_name, company.email, company.phone]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {company.notes && (
                <p className="mt-1 text-sm text-stera-ink-soft">{company.notes}</p>
              )}
            </div>
            <RowMenu>
              <RowMenuItem href={`/companies/${company.id}/edit`}>
                Bewerken
              </RowMenuItem>
              <div className="border-t border-stera-line" />
              <DeleteCompanyButton companyId={company.id} variant="menu" />
            </RowMenu>
          </div>
        </div>

        {/* Open acties — bovenaan */}
        {hasOpenActions ? (
          <section className="space-y-3">
            <p className="stera-eyebrow text-amber-800">Open acties</p>
            <ul className="space-y-2">
              {unscheduledOrders.slice(0, 5).map((o: any) => (
                <li key={o.id}>
                  <Link
                    href={`${base}/bestellingen`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm hover:border-amber-400"
                  >
                    <span className="font-medium text-stera-ink">
                      {o.name || 'Bestelling'} · levering inplannen
                    </span>
                    <span className="text-xs text-amber-800">Plan →</span>
                  </Link>
                </li>
              ))}
              {openWo.draft.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/work-orders/${w.id}?from=${encodeURIComponent(`${base}/werkbonnen`)}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm hover:border-amber-400"
                  >
                    <span className="font-medium text-stera-ink">
                      {w.reference_number || 'Werkbon'} · te versturen
                    </span>
                    <span className="text-xs text-amber-800">Open →</span>
                  </Link>
                </li>
              ))}
              {openWo.sent.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/work-orders/${w.id}?from=${encodeURIComponent(`${base}/werkbonnen`)}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-2.5 text-sm hover:border-blue-400"
                  >
                    <span className="font-medium text-stera-ink">
                      {w.reference_number || 'Werkbon'} · wacht op handtekening
                    </span>
                    <span className="text-xs text-blue-800">Open →</span>
                  </Link>
                </li>
              ))}
              {openWo.signed.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/work-orders/${w.id}?from=${encodeURIComponent(`${base}/werkbonnen`)}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm hover:border-amber-400"
                  >
                    <span className="font-medium text-stera-ink">
                      {w.reference_number || 'Werkbon'} · te factureren
                      {w.signed_name ? ` (door ${w.signed_name})` : ''}
                    </span>
                    <span className="text-xs text-amber-900">Factureer →</span>
                  </Link>
                </li>
              ))}
              {plannedVisits.slice(0, 3).map((v: any) => (
                <li key={v.id}>
                  <Link
                    href={`/maintenance/${v.id}?from=${encodeURIComponent(`${base}/onderhoud`)}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-stera-line bg-white px-3 py-2.5 text-sm hover:border-stera-green"
                  >
                    <span className="font-medium text-stera-ink">
                      {v.title || 'Onderhoud'} · gepland
                      {v.scheduled_start
                        ? ` · ${formatDay(v.scheduled_start)}`
                        : ''}
                    </span>
                    <span className="text-xs text-stera-green">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Klantoverzicht — tegels linken naar subpagina's van deze klant */}
        <section className="space-y-3">
          <p className="stera-eyebrow text-stera-green">Klantoverzicht</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OverviewCard
              label="Onderhoud"
              value={plannedVisits.length}
              href={`${base}/onderhoud`}
              hint={`${completedVisits.length} gebeurd · ${visits?.length ?? 0} totaal`}
            />
            <OverviewCard
              label="Planten"
              value={plantsCount ?? 0}
              href={`${base}/planten`}
            />
            <OverviewCard
              label="Werkbonnen"
              value={workOrders.length}
              href={`${base}/werkbonnen`}
              hint={
                openWo.signed.length > 0
                  ? `${openWo.signed.length} te factureren`
                  : invoicedCount > 0
                    ? `${invoicedCount} gefactureerd`
                    : undefined
              }
            />
            <OverviewCard
              label="Bestellingen"
              value={orderList.length}
              href={`${base}/bestellingen`}
              hint={
                openOrders.length > 0
                  ? `${openOrders.length} open`
                  : undefined
              }
            />
          </div>
        </section>

        {/* Locaties — duidelijke sectie-header i.p.v. losse pil */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="stera-eyebrow text-stera-green">Locaties</p>
              <p className="text-sm text-stera-ink-soft">
                {locations?.length === 1
                  ? '1 locatie bij deze klant'
                  : `${locations?.length ?? 0} locaties bij deze klant`}
              </p>
            </div>
            <Link
              href={`${base}/locations/new`}
              className="stera-cta stera-cta-primary"
            >
              + Nieuwe locatie
            </Link>
          </div>

          {locationsError ? (
            <p className="text-red-600">
              Fout bij ophalen locaties: {locationsError.message}
            </p>
          ) : !locations || locations.length === 0 ? (
            <div className="stera-empty space-y-3">
              <p className="stera-empty-title">Nog geen locaties</p>
              <p className="text-sm">
                Voeg een locatie toe — bijvoorbeeld een kantoorgebouw of
                winkelpand — om ruimtes en planten te beheren.
              </p>
              <div>
                <Link
                  href={`${base}/locations/new`}
                  className="stera-cta stera-cta-primary"
                >
                  + Eerste locatie toevoegen
                </Link>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {locations.map((location) => (
                <li
                  key={location.id}
                  className="stera-card transition hover:border-stera-green"
                >
                  <Link href={`/locations/${location.id}`} className="block">
                    <p className="font-semibold text-stera-ink">
                      {location.name}
                    </p>
                    {(location.street || location.city) && (
                      <p className="mt-1 text-sm text-stera-ink-soft">
                        {[
                          [location.street, location.number]
                            .filter(Boolean)
                            .join(' '),
                          location.city,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {location.notes && (
                      <p className="mt-2 text-sm text-stera-ink-soft">
                        {location.notes}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
