import Link from 'next/link'
import SteraLogo from '@/components/stera-logo'
import { createClient } from '@/lib/supabase/server'
import { formatEur } from '@/lib/pot-sizes'
import SignForm from './sign-form'

const LIGHT_LABELS: Record<string, string> = {
  high: 'Veel licht',
  medium: 'Matig licht',
  low: 'Weinig licht',
}

const ACTION_KEYS = [
  ['action_checked', 'gecontroleerd'],
  ['action_watered', 'water'],
  ['action_pruned', 'gesnoeid'],
  ['action_fed', 'voeding'],
  ['action_cleaned', 'bladeren gereinigd'],
  ['action_rotated', 'gedraaid'],
  ['action_polished', 'bladglans'],
  ['action_repotted', 'verpot'],
  ['action_replaced', 'vervangen'],
] as const

function formatDate(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('nl-BE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatDateTime(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleString('nl-BE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: string | null, end: string | null, pauseMin: number | null) {
  if (!start || !end) return null
  const sm = new Date(start).getTime()
  const em = new Date(end).getTime()
  if (!Number.isFinite(sm) || !Number.isFinite(em)) return null
  const total = Math.max(0, Math.round((em - sm) / 60000))
  const work = Math.max(0, total - (pauseMin ?? 0))
  const billed = Math.ceil(work / 30) * 30
  const h = Math.floor(billed / 60)
  const m = billed % 60
  return h > 0 ? `${h}u${m === 0 ? '00' : m.toString().padStart(2, '0')}` : `${m}min`
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink flex flex-col">
      <header className="px-5 py-5 sm:px-10 sm:py-8 border-b border-stera-line">
        <SteraLogo variant="default" />
      </header>
      <div className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
        <div className="mx-auto w-full max-w-2xl space-y-8">{children}</div>
      </div>
      <footer className="px-5 py-5 sm:px-10 text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_work_order_for_signing', {
    _token: token,
  })

  if (error || !data) {
    return (
      <Shell>
        <div>
          <p className="stera-eyebrow text-stera-green mb-3">Werkbon</p>
          <h1 className="text-3xl font-bold mb-3">
            Deze link is niet (meer) geldig
          </h1>
          <p className="text-base text-stera-ink-soft">
            De werkbon is mogelijk al getekend, ingetrokken of de link bevat
            een fout. Vraag Stera om je een nieuwe link te bezorgen.
          </p>
          <div className="mt-6">
            <Link href="/" className="stera-cta stera-cta-secondary">
              Terug naar start
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  // De RPC geeft een jsonb terug — Supabase decodeert dat naar een
  // generic object. Cast pragmatisch.
  const wo = data as any
  const visit = wo?.visit ?? {}
  const company = wo?.company ?? {}
  const location = wo?.location ?? {}
  const plants: any[] = Array.isArray(wo?.plants) ? wo.plants : []
  const consumables: any[] = Array.isArray(wo?.consumables) ? wo.consumables : []

  const hasContract = Boolean(company?.has_maintenance_contract)
  const replacements = plants.filter((p) => p.followup_replace)
  const treated = plants.filter((p) => !p.followup_replace)
  const duration = formatDuration(
    visit.started_at,
    visit.ended_at,
    visit.pause_total_minutes
  )
  const reportDate = formatDate(visit.ended_at || visit.scheduled_start)
  const isAlreadySigned = wo.status === 'signed'

  return (
    <Shell>
      <div>
        <p className="stera-eyebrow text-stera-green mb-3">Werkbon</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          {visit.title || 'Onderhoudsbeurt'}
        </h1>
        {reportDate ? (
          <p className="text-base text-stera-ink-soft">{reportDate}</p>
        ) : null}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 text-sm">
        <div>
          <p className="stera-eyebrow text-stera-green mb-1">Voor</p>
          <p className="font-semibold">{company?.name || '—'}</p>
          {company?.contact_name ? (
            <p className="text-stera-ink-soft">{company.contact_name}</p>
          ) : null}
        </div>
        <div>
          <p className="stera-eyebrow text-stera-green mb-1">Locatie</p>
          <p className="font-semibold">{location?.name || '—'}</p>
          {location?.street ? (
            <p className="text-stera-ink-soft">
              {[location.street, location.number].filter(Boolean).join(' ')}
              {location.postal_code || location.city ? (
                <>
                  <br />
                  {[location.postal_code, location.city]
                    .filter(Boolean)
                    .join(' ')}
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      {!hasContract && duration ? (
        <section className="rounded border border-stera-line bg-white p-4 text-sm">
          <p className="stera-eyebrow text-stera-green mb-1">Werkduur</p>
          <p className="text-lg font-semibold">{duration}</p>
          <p className="text-xs text-stera-ink-soft">
            Afgerond op halfuur, pauzes uitgesloten
          </p>
        </section>
      ) : null}

      <section>
        <p className="stera-eyebrow text-stera-green mb-2">
          Behandelde planten
        </p>
        {treated.length === 0 ? (
          <p className="text-sm text-stera-ink-soft">
            Geen planten geregistreerd.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {treated.map((vp: any) => {
              const actions = ACTION_KEYS
                .filter(([key]) => Boolean(vp[key]))
                .map(([, label]) => label)
              return (
                <li
                  key={vp.id}
                  className="rounded border border-stera-line bg-white p-3"
                >
                  <div className="flex flex-wrap gap-3">
                    {vp.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={vp.photo_url}
                        alt={vp.nickname || 'Plant'}
                        className="h-20 w-20 shrink-0 rounded object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {vp.nickname ||
                          vp.species ||
                          vp.reference_code ||
                          'Plant'}
                      </p>
                      {vp.reference_code && vp.reference_code !== vp.nickname ? (
                        <p className="text-xs font-mono text-stera-ink-soft">
                          {vp.reference_code}
                        </p>
                      ) : null}
                      {actions.length > 0 ? (
                        <p className="mt-1 text-xs text-stera-ink-soft">
                          {actions.join(' · ')}
                        </p>
                      ) : null}
                      {vp.notes ? (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-stera-ink-soft">
                          {vp.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {replacements.length > 0 ? (
        <section>
          <p className="stera-eyebrow text-stera-green mb-1">
            Voorstel: te vervangen planten
          </p>
          <p className="mb-3 text-sm text-stera-ink-soft">
            {replacements.length === 1
              ? '1 plant'
              : `${replacements.length} planten`}{' '}
            kwamen niet door de inspectie. Hieronder de specs voor de
            vervanging.
          </p>
          <ul className="space-y-4 text-sm">
            {replacements.map((vp: any) => {
              const lightKey =
                vp.replacement_light_level === 'high' ||
                vp.replacement_light_level === 'medium' ||
                vp.replacement_light_level === 'low'
                  ? vp.replacement_light_level
                  : null
              return (
                <li
                  key={vp.id}
                  className="overflow-hidden rounded border border-stera-green/40 bg-white"
                >
                  <div className="flex flex-wrap gap-3 border-b border-stera-line bg-stera-cream-deep/40 p-3">
                    {vp.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={vp.photo_url}
                        alt={`Huidige plant: ${vp.nickname || ''}`}
                        className="h-24 w-24 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-xs text-stera-ink-soft">
                        geen foto
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wider text-stera-ink-soft">
                        Huidige plant
                      </p>
                      <p className="font-semibold">
                        {vp.nickname ||
                          vp.species ||
                          vp.reference_code ||
                          'Plant'}
                      </p>
                      {vp.species && vp.nickname ? (
                        <p className="text-xs text-stera-ink-soft">
                          {vp.species}
                        </p>
                      ) : null}
                      {vp.reference_code ? (
                        <p className="text-xs font-mono text-stera-ink-soft">
                          {vp.reference_code}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="p-3">
                    <p className="mb-2 text-xs uppercase tracking-wider text-stera-green">
                      Voorstel vervanging
                    </p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-stera-ink-soft">Licht</dt>
                        <dd className="font-medium text-sm">
                          {lightKey ? LIGHT_LABELS[lightKey] : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stera-ink-soft">Hoogte</dt>
                        <dd className="font-medium text-sm">
                          {vp.replacement_height_cm
                            ? `± ${vp.replacement_height_cm} cm`
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stera-ink-soft">Pot-Ø</dt>
                        <dd className="font-medium text-sm">
                          {vp.replacement_pot_diameter_cm
                            ? `${vp.replacement_pot_diameter_cm} cm`
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stera-ink-soft">Buitenpot</dt>
                        <dd className="font-medium text-sm">
                          {vp.replacement_needs_outer_pot ? 'ja' : 'nee'}
                        </dd>
                      </div>
                    </dl>
                    {vp.replacement_notes ? (
                      <p className="mt-3 whitespace-pre-wrap rounded bg-stera-cream-deep/40 p-2 text-xs text-stera-ink">
                        {vp.replacement_notes}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {!hasContract && consumables.length > 0 ? (
        <section>
          <p className="stera-eyebrow text-stera-green mb-2">
            Verbruiksgoederen
          </p>
          {(() => {
            let grandTotal = 0
            const rows = consumables.map((c: any) => {
              const unitSize = c.unit_size ?? null
              const unitPrice = c.unit_price_cents ?? null
              let lineTotal: number | null = null
              if (unitSize && unitPrice && unitSize > 0) {
                lineTotal = Math.round(
                  (Number(c.quantity) / unitSize) * unitPrice
                )
                grandTotal += lineTotal
              }
              return { id: c.id, c, lineTotal }
            })
            return (
              <>
                <ul className="divide-y divide-stera-line rounded border border-stera-line bg-white text-sm">
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2"
                    >
                      <span className="font-medium flex-1 min-w-0">
                        {r.c.name || 'Verbruik'}
                      </span>
                      <span className="text-stera-ink-soft">
                        {r.c.quantity}
                        {r.c.unit ? ` ${r.c.unit}` : ''}
                      </span>
                      {r.lineTotal != null ? (
                        <span className="font-medium tabular-nums w-20 text-right">
                          {formatEur(r.lineTotal)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {grandTotal > 0 ? (
                  <p className="mt-2 text-right text-sm font-semibold">
                    Totaal verbruik: {formatEur(grandTotal)}
                  </p>
                ) : null}
              </>
            )
          })()}
        </section>
      ) : null}

      {hasContract ? (
        <p className="rounded border border-dashed border-stera-line bg-stera-cream-deep/40 p-3 text-xs text-stera-ink-soft">
          Onderhoudscontract: uren en verbruiksgoederen zijn gedekt door je
          lopende contract en worden niet apart gefactureerd. Plantvervangingen
          vallen buiten het contract.
        </p>
      ) : null}

      <hr className="border-stera-line" />

      {isAlreadySigned ? (
        <div className="rounded-xl border border-stera-green/40 bg-stera-green/5 p-6">
          <p className="stera-eyebrow text-stera-green mb-2">Goedgekeurd</p>
          <p className="text-sm">
            Deze werkbon werd ondertekend door{' '}
            <strong>{wo.signed_name || 'klant'}</strong>
            {wo.signed_at ? (
              <> op {formatDateTime(wo.signed_at)}.</>
            ) : null}
          </p>
        </div>
      ) : (
        <SignForm token={token} />
      )}
    </Shell>
  )
}
