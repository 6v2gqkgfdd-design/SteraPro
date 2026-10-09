import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { SyncCounts } from '@/lib/shopify-inventory-plan'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Voorraadverslag' }

type ReportDetails = {
  guard?: { blocked?: boolean; reasons?: string[] }
  errors?: string[]
  zero_new?: { itemcode: string; title: string; zero_since: string | null; qty: number }[]
  restored?: { itemcode: string; title: string; qty: number }[]
  hidden_today?: { itemcode: string; title: string; zero_since: string | null }[]
}

type ReportRow = {
  id: number
  run_at: string
  ok: boolean
  dry_run: boolean
  counts: Partial<SyncCounts> | null
  details: ReportDetails | null
}

const COUNTERS: { key: keyof SyncCounts; label: string }[] = [
  { key: 'synced', label: 'Gesynchroniseerd' },
  { key: 'with_stock', label: 'Met voorraad' },
  { key: 'at_zero', label: 'Op 0' },
  { key: 'oos_1_13', label: '1–13 dagen op 0' },
  { key: 'hidden_14d_today', label: 'Vandaag verborgen na 14 dagen' },
  { key: 'hidden_total', label: 'Verborgen door deze job' },
  { key: 'restored', label: 'Terug op voorraad' },
  { key: 'errors', label: 'Fouten' },
]

function when(iso: string) {
  return new Date(iso).toLocaleString('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function StockVerslagPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) redirect('/dashboard')

  const { data, error } = await supabase
    .from('stock_sync_reports')
    .select('id, run_at, ok, dry_run, counts, details')
    .order('run_at', { ascending: false })
    .limit(30)

  const missing =
    Boolean(error) &&
    /schema cache|does not exist|could not find the table/i.test(error?.message || '')
  const reports = (missing ? [] : (data ?? [])) as ReportRow[]
  const latest = reports[0]

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-8 sm:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            href="/admin/catalogus"
            className="text-xs font-medium text-stera-green underline-offset-4 hover:underline"
          >
            ← Catalogus
          </Link>
          <h1 className="mt-2 font-serif text-3xl text-stera-green">Voorraadverslag</h1>
          <p className="mt-1 text-sm text-stera-ink-soft">
            Dagelijkse sync van Nieuwkoop-voorraad naar Shopify. Dry-run schrijft
            niets naar de winkel.
          </p>
        </div>

        {error && !missing ? (
          <p className="rounded-xl border border-stera-line bg-white p-4 text-sm text-stera-ink">
            Verslag laden mislukt: {error.message}
          </p>
        ) : null}

        {missing ? (
          <p className="rounded-xl border border-stera-line bg-white p-4 text-sm text-stera-ink">
            De tabel stock_sync_reports bestaat hier nog niet. De migratie staat
            in de repo en is niet op deze database toegepast.
          </p>
        ) : null}

        {!error && !latest ? (
          <p className="rounded-xl border border-stera-line bg-white p-4 text-sm text-stera-ink-soft">
            Nog geen verslag. De cron /api/cron/sync-shopify-inventory vult dit
            na de eerste run.
          </p>
        ) : null}

        {latest ? (
          <section className="space-y-4 rounded-xl border border-stera-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-stera-green">Laatste run</h2>
              <p className="text-xs text-stera-ink-soft">
                {when(latest.run_at)} · {latest.dry_run ? 'dry-run' : 'live'} ·{' '}
                {latest.ok ? 'ok' : 'aandacht'}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {COUNTERS.map((c) => (
                <div key={c.key} className="rounded-lg border border-stera-line/80 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
                    {c.label}
                  </dt>
                  <dd className="mt-1 font-serif text-2xl text-stera-green">
                    {latest.counts?.[c.key] ?? 0}
                  </dd>
                </div>
              ))}
            </dl>
            {latest.details?.guard?.reasons?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-stera-ink">
                {latest.details.guard.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            <Sample title="Nieuw op 0" rows={latest.details?.zero_new} />
            <Sample title="Vandaag verborgen" rows={latest.details?.hidden_today} />
            <Sample title="Terug" rows={latest.details?.restored} />
            {latest.details?.errors?.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-stera-ink-soft">
                  Fouten
                </h3>
                <ul className="mt-1 list-disc pl-5 text-sm text-stera-ink">
                  {latest.details.errors.slice(0, 8).map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {reports.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-stera-line bg-white">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Recente voorraad-syncs</caption>
              <thead className="border-b border-stera-line text-[10px] uppercase tracking-wider text-stera-ink-soft">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Wanneer</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Modus</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Met voorraad</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Op 0</th>
                  <th scope="col" className="px-3 py-2 font-semibold">1–13 d</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Verborgen</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Terug</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Fouten</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((row) => (
                  <tr key={row.id} className="border-b border-stera-line/70 last:border-0">
                    <th scope="row" className="px-3 py-2 font-medium text-stera-ink">
                      {when(row.run_at)}
                    </th>
                    <td className="px-3 py-2 text-stera-ink-soft">
                      {row.dry_run ? 'dry-run' : 'live'}
                      {row.ok ? '' : ' · aandacht'}
                    </td>
                    <td className="px-3 py-2">{row.counts?.with_stock ?? 0}</td>
                    <td className="px-3 py-2">{row.counts?.at_zero ?? 0}</td>
                    <td className="px-3 py-2">{row.counts?.oos_1_13 ?? 0}</td>
                    <td className="px-3 py-2">{row.counts?.hidden_14d_today ?? 0}</td>
                    <td className="px-3 py-2">{row.counts?.restored ?? 0}</td>
                    <td className="px-3 py-2">{row.counts?.errors ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  )
}

function Sample({
  title,
  rows,
}: {
  title: string
  rows?: { itemcode: string; title: string; zero_since?: string | null; qty?: number }[]
}) {
  if (!rows?.length) return null
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-stera-ink-soft">
        {title}
      </h3>
      <ul className="mt-1 space-y-1 text-sm text-stera-ink">
        {rows.slice(0, 8).map((row) => (
          <li key={`${title}-${row.itemcode}`}>
            <span className="font-medium">{row.itemcode}</span> {row.title}
            {row.zero_since ? ` · sinds ${row.zero_since}` : ''}
            {row.qty != null ? ` · qty ${row.qty}` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
