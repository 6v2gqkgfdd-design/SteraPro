/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Breadcrumbs } from '@/components/breadcrumbs'
import {
  deliveryStatusLabel,
  formatDay,
  formatDayTime,
  formatEurFromCents,
} from '@/lib/company-labels'
import {
  markOrderDelivered,
  scheduleOrderDelivery,
  unscheduleOrder,
} from './actions'
import ImportOrdersButton from './import-button'

export default async function CompanyOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, email')
    .eq('id', id)
    .maybeSingle()
  if (!company) notFound()

  const base = `/companies/${company.id}`

  const [{ data: orders, error }, { data: locations }] = await Promise.all([
    supabase
      .from('shopify_orders')
      .select('*')
      .eq('company_id', id)
      .order('ordered_at', { ascending: false }),
    supabase
      .from('locations')
      .select('id, name')
      .eq('company_id', id)
      .order('name'),
  ])

  const list = orders ?? []

  return (
    <main className="stera-page-pb bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <Breadcrumbs
          items={[
            { label: 'Klanten', href: '/companies' },
            { label: company.name, href: base },
            { label: 'Bestellingen' },
          ]}
        />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl text-stera-green">Bestellingen</h1>
            <p className="mt-1 text-sm text-stera-ink-soft">
              Uit de Shopify-shop. Plan leveringen in zoals onderhoud.
              {company.email ? (
                <span>
                  {' '}
                  Matching op e-mail <strong>{company.email}</strong>.
                </span>
              ) : (
                <span className="text-amber-800">
                  {' '}
                  Zet een e-mail op de klant voor automatische koppeling.
                </span>
              )}
            </p>
          </div>
          <ImportOrdersButton companyId={company.id} />
        </div>

        {error ? (
          <p className="text-red-600">{error.message}</p>
        ) : list.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed border-stera-line p-6 text-center text-sm text-stera-ink-soft">
            <p>Nog geen bestellingen voor deze klant.</p>
            <p>
              Importeer uit Shopify (orders worden gekoppeld via
              klant-e-mailadres).
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {list.map((o: any) => {
              const lines = Array.isArray(o.line_items) ? o.line_items : []
              const needsSchedule = o.delivery_status === 'unscheduled'
              return (
                <li
                  key={o.id}
                  className="rounded-xl border border-stera-line bg-white p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-stera-ink">
                        {o.name || `#${o.shopify_order_number || '—'}`}
                      </p>
                      <p className="text-xs text-stera-ink-soft">
                        {formatDay(o.ordered_at)}
                        {o.financial_status ? ` · ${o.financial_status}` : ''}
                        {o.fulfillment_status
                          ? ` · Shopify: ${o.fulfillment_status}`
                          : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-stera-ink">
                        {formatEurFromCents(o.total_price_cents, o.currency)}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
                        {deliveryStatusLabel(o.delivery_status)}
                      </p>
                    </div>
                  </div>

                  {lines.length > 0 ? (
                    <ul className="space-y-0.5 text-xs text-stera-ink-soft">
                      {lines.slice(0, 6).map((li: any, i: number) => (
                        <li key={i}>
                          {li.quantity}× {li.title}
                          {li.variant_title ? ` (${li.variant_title})` : ''}
                        </li>
                      ))}
                      {lines.length > 6 ? (
                        <li>+{lines.length - 6} meer…</li>
                      ) : null}
                    </ul>
                  ) : null}

                  {o.scheduled_start ? (
                    <p className="text-sm text-stera-green">
                      Levering: {formatDayTime(o.scheduled_start)}
                    </p>
                  ) : null}

                  {needsSchedule ? (
                    <form
                      action={scheduleOrderDelivery}
                      className="grid gap-2 rounded-lg border border-stera-line bg-stera-cream/60 p-3 sm:grid-cols-2"
                    >
                      <input type="hidden" name="order_id" value={o.id} />
                      <input type="hidden" name="company_id" value={company.id} />
                      <label className="block text-xs font-medium text-stera-ink-soft sm:col-span-2">
                        Levering inplannen
                        <input
                          type="datetime-local"
                          name="scheduled_start"
                          required
                          className="mt-1 w-full rounded-lg border border-stera-line bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="block text-xs font-medium text-stera-ink-soft">
                        Locatie
                        <select
                          name="location_id"
                          className="mt-1 w-full rounded-lg border border-stera-line bg-white px-3 py-2 text-sm"
                          defaultValue=""
                        >
                          <option value="">— optioneel —</option>
                          {(locations ?? []).map((l: any) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-stera-ink-soft">
                        Nota
                        <input
                          name="delivery_notes"
                          className="mt-1 w-full rounded-lg border border-stera-line bg-white px-3 py-2 text-sm"
                          placeholder="Bv. laden achteraan"
                        />
                      </label>
                      <div className="sm:col-span-2">
                        <button
                          type="submit"
                          className="rounded-full bg-stera-green px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                        >
                          Inplannen op agenda
                        </button>
                      </div>
                    </form>
                  ) : o.delivery_status === 'scheduled' ||
                    o.delivery_status === 'in_progress' ? (
                    <div className="flex flex-wrap gap-2">
                      <form action={markOrderDelivered}>
                        <input type="hidden" name="order_id" value={o.id} />
                        <input
                          type="hidden"
                          name="company_id"
                          value={company.id}
                        />
                        <button
                          type="submit"
                          className="rounded-full bg-stera-green px-3 py-1.5 text-xs font-medium text-white"
                        >
                          Markeer geleverd
                        </button>
                      </form>
                      <form action={unscheduleOrder}>
                        <input type="hidden" name="order_id" value={o.id} />
                        <input
                          type="hidden"
                          name="company_id"
                          value={company.id}
                        />
                        <button
                          type="submit"
                          className="rounded-full border border-stera-line bg-white px-3 py-1.5 text-xs font-medium text-stera-ink"
                        >
                          Planning wissen
                        </button>
                      </form>
                    </div>
                  ) : null}
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
