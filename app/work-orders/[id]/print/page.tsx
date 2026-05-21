import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatEur, findPotSize } from '@/lib/pot-sizes'
import {
  HOURLY_RATE_EUR_CENTS,
  billedMinutes,
  formatBilledDuration,
  formatPauseDuration,
  formatWorkRangeText,
  labourCostCents,
} from '@/lib/labour'
import { formatRoomLabel } from '@/lib/rooms'
import WorkOrderPrintToolbar from './print-toolbar'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nog te versturen',
  sent: 'Wachten op goedkeuring',
  signed: 'Goedgekeurd',
  invoiced: 'Gefactureerd',
  cancelled: 'Geannuleerd',
  archived: 'Gearchiveerd',
}

const ACTION_LABELS: Record<string, string> = {
  action_checked: 'gecontroleerd',
  action_watered: 'water',
  action_fed: 'voeding',
  action_pruned: 'gesnoeid',
  action_rotated: 'gedraaid',
  action_cleaned: 'bladeren gereinigd',
  action_repotted: 'verpot',
  action_replaced: 'vervangen',
}

// Print-specifieke CSS: verbergt de toolbar, maakt het blad paginavullend
// en zorgt dat accentkleuren mee afgedrukt worden.
const PRINT_CSS = `
.wo-paper { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.wo-avoid-break { break-inside: avoid; }
@media print {
  .wo-toolbar { display: none !important; }
  .wo-print-root {
    background: #ffffff !important;
    padding: 0 !important;
    min-height: 0 !important;
  }
  .wo-paper {
    max-width: none !important;
    margin: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }
  @page { margin: 14mm; }
}
`

function formatDateOnly(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatDateTime(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleString('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Verklein remote foto's via de Next.js image-optimizer. Full-res
// telefoonfoto's laten anders het PDF-/afdrukvoorbeeld van de browser
// vastlopen; een geoptimaliseerde 384px-versie houdt de print licht.
function thumb(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('data:')) return url
  return `/_next/image?url=${encodeURIComponent(url)}&w=384&q=75`
}

export default async function WorkOrderPrintPage({
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

  const { data: workOrder, error } = await supabase
    .from('work_orders')
    .select(
      `*,
       maintenance_visits (
         id,
         title,
         scheduled_start,
         started_at,
         ended_at,
         pause_total_minutes,
         planned_tasks,
         general_notes,
         company_id,
         location_id,
         locations ( id, name, street, number, postal_code, city ),
         companies ( id, name, contact_name, email, has_maintenance_contract ),
         maintenance_visit_rooms ( rooms ( id, name, floor ) )
       )`
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !workOrder) {
    notFound()
  }

  const visit = Array.isArray(workOrder.maintenance_visits)
    ? workOrder.maintenance_visits[0]
    : workOrder.maintenance_visits

  if (!visit) notFound()

  const company = Array.isArray(visit.companies)
    ? visit.companies[0]
    : visit.companies
  const location = Array.isArray(visit.locations)
    ? visit.locations[0]
    : visit.locations
  const hasContract = Boolean(company?.has_maintenance_contract)

  const { data: visitPlants } = await supabase
    .from('maintenance_visit_plants')
    .select(
      `*, plants ( id, nickname, species, reference_code, photo_url, pot_size_code, status )`
    )
    .eq('visit_id', visit.id)
    .order('created_at', { ascending: true })

  const { data: consumables } = await supabase
    .from('maintenance_visit_consumables')
    .select(
      `id, custom_name, quantity, unit, notes,
       consumable_catalog ( id, name, unit_size, unit_price_cents )`
    )
    .eq('visit_id', visit.id)
    .order('created_at', { ascending: true })

  // Categoriseer behandelde planten — zelfde logica als de werkbon-
  // detailpagina: Gezond · Ziek · Verpot · Dood.
  const groups: {
    healthy: any[]
    sick: any[]
    repotted: any[]
    dead: any[]
  } = { healthy: [], sick: [], repotted: [], dead: [] }

  for (const vp of visitPlants ?? []) {
    const plant = Array.isArray(vp.plants) ? vp.plants[0] : vp.plants
    const plantStatus = plant?.status || ''
    const healthStatus = vp.health_status || ''
    const isDead =
      vp.action_replaced ||
      vp.followup_replace ||
      plantStatus === 'dead' ||
      plantStatus === 'replacement_needed' ||
      healthStatus === 'dead'
    if (isDead) {
      groups.dead.push(vp)
      continue
    }
    if (vp.action_repotted) {
      groups.repotted.push(vp)
      continue
    }
    const isSick =
      healthStatus === 'needs_attention' ||
      healthStatus === 'dying' ||
      plantStatus === 'needs_attention' ||
      plantStatus === 'maintenance_due' ||
      plantStatus === 'replacement_needed'
    if (isSick) {
      groups.sick.push(vp)
      continue
    }
    groups.healthy.push(vp)
  }

  const replacements = groups.dead

  const visitRoomLabels: string[] = Array.isArray(visit.maintenance_visit_rooms)
    ? (visit.maintenance_visit_rooms as any[])
        .map((mvr) => {
          const r = Array.isArray(mvr.rooms) ? mvr.rooms[0] : mvr.rooms
          return r ? formatRoomLabel(r.name, r.floor) : null
        })
        .filter((v): v is string => Boolean(v))
    : []

  const billed = billedMinutes(
    visit.started_at,
    visit.ended_at,
    visit.pause_total_minutes
  )
  const duration = formatBilledDuration(billed)
  const labourCost = labourCostCents(billed)
  const workRange = formatWorkRangeText(visit.started_at, visit.ended_at)
  const pauseText = formatPauseDuration(visit.pause_total_minutes)

  const isSigned =
    workOrder.status === 'signed' || workOrder.status === 'invoiced'
  const visitDate = formatDateOnly(visit.ended_at || visit.scheduled_start)

  return (
    <main className="wo-print-root min-h-screen bg-stera-cream-deep/50 px-4 py-6 text-stera-ink">
      <style>{PRINT_CSS}</style>

      <WorkOrderPrintToolbar workOrderId={workOrder.id} />

      <article className="wo-paper mx-auto max-w-[820px] rounded-xl border border-stera-line bg-white p-8 shadow-sm sm:p-12">
        {/* Documentkop */}
        <header className="flex items-start justify-between gap-6 border-b-2 border-stera-green pb-5">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/stera-logo.png"
              alt="Stera"
              className="h-8 w-auto select-none"
            />
            <p className="mt-2 text-xs text-stera-ink-soft">
              Plantbeheer voor professionals
            </p>
          </div>
          <div className="text-right">
            <p className="stera-eyebrow text-stera-green">Werkbon</p>
            <p className="mt-1 font-mono text-xl font-bold text-stera-ink">
              {workOrder.reference_number || '—'}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-stera-ink-soft">
              {STATUS_LABEL[workOrder.status] || workOrder.status}
            </p>
            {visitDate ? (
              <p className="text-xs text-stera-ink-soft">{visitDate}</p>
            ) : null}
          </div>
        </header>

        <h1 className="mt-5 text-2xl font-bold tracking-tight">
          {visit.title || 'Onderhoudsbeurt'}
        </h1>

        {/* Klant + Locatie */}
        <section className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <p className="stera-eyebrow mb-1 text-stera-green">Klant</p>
            <p className="font-semibold">{company?.name || '—'}</p>
            {company?.contact_name ? (
              <p className="text-stera-ink-soft">{company.contact_name}</p>
            ) : null}
            {company?.email ? (
              <p className="text-stera-ink-soft">{company.email}</p>
            ) : null}
          </div>
          <div>
            <p className="stera-eyebrow mb-1 text-stera-green">Locatie</p>
            <p className="font-semibold">{location?.name || '—'}</p>
            {location?.street ? (
              <p className="text-stera-ink-soft">
                {[location.street, location.number]
                  .filter(Boolean)
                  .join(' ')}
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

        {/* Behandelde ruimtes */}
        <section className="mt-6">
          <p className="stera-eyebrow mb-2 text-stera-green">
            Behandelde ruimtes
          </p>
          {visitRoomLabels.length > 0 ? (
            <p className="text-sm text-stera-ink">
              {visitRoomLabels.join(' · ')}
            </p>
          ) : (
            <p className="text-sm text-stera-ink-soft">Volledige locatie</p>
          )}
        </section>

        {/* Werkduur */}
        {!hasContract && duration ? (
          <section className="wo-avoid-break mt-6 rounded-lg border border-stera-line bg-stera-cream-deep/40 p-4 text-sm">
            <p className="stera-eyebrow mb-1 text-stera-green">Werkduur</p>
            <p className="text-lg font-semibold">
              {duration}
              {pauseText ? (
                <span className="ml-2 text-sm font-normal text-stera-ink-soft">
                  ({pauseText})
                </span>
              ) : null}
            </p>
            {workRange ? (
              <p className="mt-1 text-xs text-stera-ink-soft">{workRange}</p>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-stera-line pt-3 text-xs">
              <dt className="text-stera-ink-soft">Uurtarief (excl. btw)</dt>
              <dd className="text-right font-medium tabular-nums">
                {formatEur(HOURLY_RATE_EUR_CENTS)} / u
              </dd>
              <dt className="text-stera-ink-soft">Totaal werkuren</dt>
              <dd className="text-right font-semibold tabular-nums">
                {labourCost != null ? formatEur(labourCost) : '—'}
              </dd>
            </dl>
          </section>
        ) : null}

        {/* Behandelde planten per categorie */}
        {(
          [
            {
              key: 'healthy',
              label: 'Gezond',
              items: groups.healthy,
              accent: 'text-stera-green',
            },
            {
              key: 'sick',
              label: 'Ziek',
              items: groups.sick,
              accent: 'text-orange-700',
            },
            {
              key: 'repotted',
              label: 'Verpot',
              items: groups.repotted,
              accent: 'text-stera-green',
            },
          ] as const
        ).map((cat) =>
          cat.items.length === 0 ? null : (
            <section key={cat.key} className="mt-6">
              <p className={`stera-eyebrow mb-2 ${cat.accent}`}>
                {cat.label} ({cat.items.length})
              </p>
              <ul className="space-y-2 text-sm">
                {cat.items.map((vp: any) => {
                  const plant = Array.isArray(vp.plants)
                    ? vp.plants[0]
                    : vp.plants
                  const photoSrc = thumb(vp.photo_url || plant?.photo_url)
                  const actions = Object.entries(ACTION_LABELS)
                    .filter(([key]) => Boolean(vp[key]))
                    .map(([, label]) => label)
                  return (
                    <li
                      key={vp.id}
                      className="wo-avoid-break flex flex-wrap gap-3 rounded-lg border border-stera-line bg-white p-3"
                    >
                      {photoSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoSrc}
                          alt={plant?.nickname || 'Plant'}
                          className="h-16 w-16 shrink-0 rounded object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {plant?.nickname ||
                            plant?.species ||
                            plant?.reference_code ||
                            'Plant'}
                        </p>
                        {plant?.reference_code &&
                        plant.reference_code !== plant?.nickname ? (
                          <p className="font-mono text-xs text-stera-ink-soft">
                            {plant.reference_code}
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
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        )}

        {/* Dode planten — te vervangen */}
        {replacements.length > 0 ? (
          <section className="mt-6">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="stera-eyebrow text-red-700">
                Dood ({replacements.length})
              </p>
              <span className="text-xs text-stera-ink-soft">
                Te vervangen — offerte opmaken
              </span>
            </div>
            <ul className="space-y-2 text-sm">
              {replacements.map((vp: any) => {
                const plant = Array.isArray(vp.plants)
                  ? vp.plants[0]
                  : vp.plants
                const photoSrc = thumb(vp.photo_url || plant?.photo_url)
                const currentPot = findPotSize(plant?.pot_size_code)
                return (
                  <li
                    key={vp.id}
                    className="wo-avoid-break flex flex-wrap gap-3 rounded-lg border border-red-200 bg-red-50/50 p-3"
                  >
                    {photoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoSrc}
                        alt={`Huidige plant: ${plant?.nickname || ''}`}
                        className="h-16 w-16 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-[10px] text-stera-ink-soft">
                        geen foto
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {plant?.nickname ||
                          plant?.species ||
                          plant?.reference_code ||
                          'Plant'}
                      </p>
                      {plant?.species && plant?.nickname ? (
                        <p className="text-xs text-stera-ink-soft">
                          {plant.species}
                        </p>
                      ) : null}
                      {plant?.reference_code ? (
                        <p className="font-mono text-xs text-stera-ink-soft">
                          {plant.reference_code}
                        </p>
                      ) : null}
                      {currentPot ? (
                        <p className="mt-1 text-xs text-stera-ink-soft">
                          Huidige potmaat: {currentPot.code}
                        </p>
                      ) : null}
                      {vp.replacement_notes ? (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-stera-ink-soft">
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

        {(visitPlants ?? []).length === 0 ? (
          <section className="mt-6">
            <p className="stera-eyebrow mb-2 text-stera-green">
              Behandelde planten
            </p>
            <p className="text-sm text-stera-ink-soft">
              Geen planten geregistreerd.
            </p>
          </section>
        ) : null}

        {/* Verbruiksgoederen */}
        {!hasContract && consumables && consumables.length > 0 ? (
          <section className="mt-6">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="stera-eyebrow text-stera-green">
                Verbruiksgoederen
              </p>
              <span className="text-xs text-stera-ink-soft">
                Prijzen excl. btw
              </span>
            </div>
            {(() => {
              const rows = consumables.map((c: any) => {
                const catalog = Array.isArray(c.consumable_catalog)
                  ? c.consumable_catalog[0]
                  : c.consumable_catalog
                const name = c.custom_name || catalog?.name || 'Verbruik'
                const unitSize = catalog?.unit_size ?? null
                const unitPrice = catalog?.unit_price_cents ?? null
                let lineTotal: number | null = null
                if (unitSize && unitPrice && unitSize > 0) {
                  lineTotal = Math.round(
                    (Number(c.quantity) / unitSize) * unitPrice
                  )
                }
                return { id: c.id, name, c, lineTotal }
              })
              return (
                <ul className="divide-y divide-stera-line rounded-lg border border-stera-line text-sm">
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2"
                    >
                      <span className="min-w-0 flex-1 font-medium">
                        {r.name}
                      </span>
                      <span className="text-stera-ink-soft">
                        {r.c.quantity}
                        {r.c.unit ? ` ${r.c.unit}` : ''}
                      </span>
                      {r.lineTotal != null ? (
                        <span className="w-20 text-right font-medium tabular-nums">
                          {formatEur(r.lineTotal)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )
            })()}
          </section>
        ) : null}

        {hasContract ? (
          <p className="mt-6 rounded-lg border border-dashed border-stera-line bg-stera-cream-deep/40 p-3 text-xs text-stera-ink-soft">
            Onderhoudscontract: uren en verbruiksgoederen zijn gedekt door het
            lopende contract en worden niet apart vermeld op deze werkbon.
            Plantvervangingen vallen buiten het contract en zijn hierboven
            opgesomd.
          </p>
        ) : null}

        {/* Algemene opmerkingen */}
        {visit.general_notes ? (
          <section className="mt-6">
            <p className="stera-eyebrow mb-1 text-stera-green">Opmerkingen</p>
            <p className="whitespace-pre-wrap text-sm text-stera-ink-soft">
              {visit.general_notes}
            </p>
          </section>
        ) : null}

        {/* Handtekening */}
        <section className="wo-avoid-break mt-8 border-t border-stera-line pt-5">
          {isSigned ? (
            <div>
              <p className="stera-eyebrow mb-2 text-stera-green">
                Goedgekeurd
              </p>
              <p className="text-sm">
                Getekend door{' '}
                <strong>{workOrder.signed_name || 'klant'}</strong>
                {workOrder.signed_at ? (
                  <> op {formatDateTime(workOrder.signed_at)}.</>
                ) : null}
              </p>
              {workOrder.signed_email ? (
                <p className="mt-1 text-xs text-stera-ink-soft">
                  E-mail: {workOrder.signed_email}
                </p>
              ) : null}
              {workOrder.signature_data ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${workOrder.signature_data}`}
                  alt="Handtekening klant"
                  className="mt-3 max-h-28 rounded border border-stera-line bg-white p-2"
                />
              ) : null}
            </div>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <p className="text-xs text-stera-ink-soft">
                  Handtekening klant
                </p>
                <div className="mt-10 border-t border-stera-ink" />
              </div>
              <div>
                <p className="text-xs text-stera-ink-soft">Naam &amp; datum</p>
                <div className="mt-10 border-t border-stera-ink" />
              </div>
            </div>
          )}
        </section>

        {/* Voettekst */}
        <footer className="mt-8 border-t border-stera-line pt-4 text-[11px] text-stera-ink-soft">
          <p>
            {workOrder.reference_number
              ? `${workOrder.reference_number} · `
              : ''}
            Stera · Plantbeheer voor professionals
          </p>
        </footer>
      </article>
    </main>
  )
}
