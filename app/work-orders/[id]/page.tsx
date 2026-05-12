import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  markAsSent,
  reopenWorkOrder,
  markAsSignedManually,
} from './actions'
import CopyLinkButton from './copy-link-button'
import DeleteWorkOrderButton from './delete-work-order-button'
import { formatEur, formatPotSize, findPotSize, nextPotSize } from '@/lib/pot-sizes'
import {
  HOURLY_RATE_EUR_CENTS,
  billedMinutes,
  formatBilledDuration,
  formatWorkRangeText,
  labourCostCents,
} from '@/lib/labour'
import { formatRoomLabel } from '@/lib/rooms'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nog te versturen',
  sent: 'Wachten op goedkeuring',
  signed: 'Goedgekeurd',
  cancelled: 'Geannuleerd',
  archived: 'Gearchiveerd',
}

const LIGHT_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: 'Veel licht',
  medium: 'Matig licht',
  low: 'Weinig licht',
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
  // 'action_polished' bewust niet meer apart — zit onder cleaned
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

function formatDateOnly(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}


export default async function WorkOrderDetailPage({
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

  // Markeer een goedgekeurde werkbon als gezien zodra Jelle 'm opent —
  // zo verdwijnt de dashboard-melding vanzelf. Faalt silent als de
  // kolom nog niet bestaat (migration nog niet gerund).
  if (workOrder.status === 'signed' && !workOrder.acknowledged_at) {
    await supabase
      .from('work_orders')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', workOrder.id)
      .then(() => {}, () => {})
  }

  const company = Array.isArray(visit.companies) ? visit.companies[0] : visit.companies
  const location = Array.isArray(visit.locations) ? visit.locations[0] : visit.locations
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

  // Categoriseer behandelde planten in 4 buckets voor op de werkbon:
  //   Gezond · Ziek · Verpot · Dood
  // Dode planten zijn alles met action_replaced, plant.status='dead'
  // of die expliciet voor vervanging gemarkeerd zijn (followup_replace).
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

  // Voor de bestaande contract-banner en backwards-compat blijven we
  // ook 'replacements' beschikbaar houden (= dood, met specs).
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

  // Bouw de signing-URL voor deze omgeving (publieke link voor klant).
  const hdrs = await headers()
  const host =
    hdrs.get('x-forwarded-host') || hdrs.get('host') || 'localhost:3000'
  const proto = hdrs.get('x-forwarded-proto') || 'https'
  const signingUrl = `${proto}://${host}/sign/${workOrder.signing_token}`

  return (
    <main className="bg-stera-cream px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="stera-eyebrow mb-2">Werkbon</p>
          <h1 className="stera-display text-3xl sm:text-4xl">
            {visit.title || 'Onderhoudsbeurt'}
          </h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            {[company?.name, location?.name].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-stera-cream-deep px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stera-ink">
              {STATUS_LABEL[workOrder.status]}
            </span>
            {hasContract ? (
              <span className="rounded-full bg-stera-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stera-green">
                Onderhoudscontract
              </span>
            ) : null}
          </div>
        </div>

        {workOrder.status === 'archived' ? (
          <div className="stera-card border-stera-line/40 bg-stera-cream-deep/30">
            <p className="stera-eyebrow mb-2">Gearchiveerd</p>
            <p className="text-sm text-stera-ink">
              Deze werkbon is automatisch gearchiveerd omdat{' '}
              <strong>{company?.name || 'de klant'}</strong> een
              onderhoudscontract heeft. Geen verzending of handtekening
              nodig — dient enkel als interne registratie.
            </p>
            {replacements.length > 0 ? (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Let op:</strong> deze beurt bevat{' '}
                {replacements.length} plant
                {replacements.length === 1 ? '' : 'en'} voor vervanging.
                Vervangingen zitten <em>niet</em> in het contract — maak
                hiervoor een aparte offerte op.
              </p>
            ) : null}
          </div>
        ) : null}

        {workOrder.status === 'draft' ? (
          <div className="stera-card border-stera-green/40">
            <p className="stera-eyebrow mb-2">Versturen naar klant</p>
            <p className="text-sm text-stera-ink-soft">
              Bekijk de werkbon hieronder. Klik daarna op &ldquo;Markeren als
              verstuurd&rdquo; en deel de onderstaande link met de klant. De klant
              kan dan via die link tekenen.
            </p>
            <form action={markAsSent} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={workOrder.id} />
              <input
                type="email"
                name="email"
                defaultValue={company?.email || ''}
                placeholder="E-mailadres klant (optioneel — voor je eigen administratie)"
                className="w-full rounded-lg border border-stera-line bg-white p-3 text-sm"
              />
              <button
                type="submit"
                className="stera-cta stera-cta-primary"
              >
                Markeren als verstuurd →
              </button>
            </form>
          </div>
        ) : null}

        {workOrder.status === 'sent' ? (
          <div className="stera-card border-stera-green/40">
            <p className="stera-eyebrow mb-2">Werkbon is verstuurd</p>
            <p className="text-sm text-stera-ink-soft">
              Deel deze link met de klant zodat hij of zij kan tekenen:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <code className="flex-1 break-all rounded-lg border border-stera-line bg-white px-3 py-2 text-xs">
                {signingUrl}
              </code>
              <CopyLinkButton url={signingUrl} />
            </div>
            {workOrder.sent_at ? (
              <p className="mt-3 text-xs text-stera-ink-soft">
                Status sinds: {formatDateTime(workOrder.sent_at)}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3 border-t border-stera-line pt-4">
              <form action={reopenWorkOrder}>
                <input type="hidden" name="id" value={workOrder.id} />
                <button type="submit" className="stera-cta stera-cta-ghost">
                  Heropenen
                </button>
              </form>
              <details className="flex-1">
                <summary className="cursor-pointer text-sm text-stera-green">
                  Manueel als getekend markeren
                </summary>
                <form action={markAsSignedManually} className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={workOrder.id} />
                  <input
                    type="text"
                    name="name"
                    placeholder="Naam ondertekenaar"
                    required
                    className="flex-1 rounded-lg border border-stera-line bg-white p-3 text-sm"
                  />
                  <button type="submit" className="stera-cta stera-cta-secondary">
                    Bevestigen
                  </button>
                </form>
              </details>
            </div>
          </div>
        ) : null}

        {workOrder.status === 'signed' ? (
          <div className="stera-card border-stera-green/40 bg-stera-green/5">
            <p className="stera-eyebrow mb-2 text-stera-green">Goedgekeurd</p>
            <p className="text-sm text-stera-ink">
              Getekend door <strong>{workOrder.signed_name || 'klant'}</strong>
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
                className="mt-4 max-h-32 rounded border border-stera-line bg-white p-2"
              />
            ) : null}
          </div>
        ) : null}

        {/* Voorvertoning werkbon */}
        <article className="stera-card space-y-6">
          <header className="border-b border-stera-line pb-4">
            <p className="stera-eyebrow text-stera-green mb-2">
              Voorbeeld werkbon
            </p>
            <h2 className="text-2xl font-bold">{visit.title}</h2>
            {visit.ended_at ? (
              <p className="text-sm text-stera-ink-soft">
                Beëindigd op {formatDateOnly(visit.ended_at)}
              </p>
            ) : null}
          </header>

          <section className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="stera-eyebrow text-stera-green mb-1">Klant</p>
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

          <section>
            <p className="stera-eyebrow text-stera-green mb-2">
              Behandelde ruimtes
            </p>
            {visitRoomLabels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {visitRoomLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-block rounded-full bg-stera-green/10 px-3 py-1 text-xs font-medium text-stera-green"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stera-ink-soft">Volledige locatie</p>
            )}
          </section>

          {!hasContract && duration ? (
            <section className="rounded border border-stera-line bg-white/60 p-4 text-sm">
              <p className="stera-eyebrow text-stera-green mb-1">Werkduur</p>
              <p className="text-lg font-semibold">{duration}</p>
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

          {(
            [
              { key: 'healthy', label: 'Gezond', items: groups.healthy, accent: 'text-stera-green' },
              { key: 'sick', label: 'Ziek', items: groups.sick, accent: 'text-orange-700' },
              { key: 'repotted', label: 'Verpot', items: groups.repotted, accent: 'text-stera-green' },
            ] as const
          ).map((cat) =>
            cat.items.length === 0 ? null : (
              <section key={cat.key}>
                <p className={`stera-eyebrow mb-2 ${cat.accent}`}>
                  {cat.label} ({cat.items.length})
                </p>
                <ul className="space-y-2 text-sm">
                  {cat.items.map((vp: any) => {
                    const plant = Array.isArray(vp.plants)
                      ? vp.plants[0]
                      : vp.plants
                    const photoUrl = vp.photo_url || plant?.photo_url || null
                    const actions = Object.entries(ACTION_LABELS)
                      .filter(([key]) => Boolean(vp[key]))
                      .map(([, label]) => label)
                    return (
                      <li
                        key={vp.id}
                        className="rounded border border-stera-line bg-white/60 p-3"
                      >
                        <div className="flex flex-wrap gap-3">
                          {photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photoUrl}
                              alt={plant?.nickname || 'Plant'}
                              className="h-20 w-20 shrink-0 rounded object-cover"
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
                              <p className="text-xs font-mono text-stera-ink-soft">
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
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          )}

          {replacements.length > 0 ? (
            <section>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="stera-eyebrow text-red-700">
                  Dood ({replacements.length})
                </p>
                <span className="text-xs text-stera-ink-soft">
                  Te vervangen — offerte opmaken
                </span>
              </div>
              <ul className="space-y-3 text-sm">
                {replacements.map((vp: any) => {
                  const plant = Array.isArray(vp.plants) ? vp.plants[0] : vp.plants
                  const photoUrl = vp.photo_url || plant?.photo_url || null
                  const currentPot = findPotSize(plant?.pot_size_code)
                  return (
                    <li
                      key={vp.id}
                      className="flex flex-wrap gap-3 rounded border border-stera-green/30 bg-red-50/40 p-3"
                    >
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrl}
                          alt={`Huidige plant: ${plant?.nickname || ''}`}
                          className="h-20 w-20 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-xs text-stera-ink-soft">
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
                          <p className="text-xs font-mono text-stera-ink-soft">
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

          {!hasContract && consumables && consumables.length > 0 ? (
            <section>
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
                  <ul className="divide-y divide-stera-line rounded border border-stera-line bg-white/60 text-sm">
                    {rows.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2"
                      >
                        <span className="font-medium flex-1 min-w-0">
                          {r.name}
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
                )
              })()}
            </section>
          ) : null}

          {hasContract ? (
            <p className="rounded border border-dashed border-stera-line bg-stera-cream-deep/40 p-3 text-xs text-stera-ink-soft">
              Onderhoudscontract: uren en verbruiksgoederen zijn gedekt door
              het lopende contract en worden niet apart vermeld op deze
              werkbon. Plantvervangingen vallen buiten het contract en zijn
              hierboven opgesomd.
            </p>
          ) : null}
        </article>

        <div className="stera-card border-red-100">
          <p className="stera-eyebrow mb-2 text-red-700">Beheer (admin)</p>
          <p className="mb-3 text-sm text-stera-ink-soft">
            Alleen gebruiken als de werkbon per ongeluk aangemaakt is, of
            als je de onderhoudsbeurt zelf nadien wil verwijderen.
          </p>
          <DeleteWorkOrderButton
            workOrderId={workOrder.id}
            visitId={visit.id}
            status={workOrder.status}
          />
        </div>

        <div className="flex justify-between text-sm">
          <Link
            href={`/maintenance/${visit.id}`}
            className="text-stera-green underline-offset-4 hover:underline"
          >
            ← Bekijk onderhoud
          </Link>
          <Link
            href="/work-orders"
            className="text-stera-green underline-offset-4 hover:underline"
          >
            Alle werkbonnen
          </Link>
        </div>
      </div>
    </main>
  )
}
