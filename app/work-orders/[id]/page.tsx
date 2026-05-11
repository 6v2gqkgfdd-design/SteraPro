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
  action_pruned: 'gesnoeid',
  action_fed: 'voeding',
  action_cleaned: 'bladeren gereinigd',
  action_rotated: 'gedraaid',
  action_polished: 'bladglans',
  action_repotted: 'verpot',
  action_replaced: 'vervangen',
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

function formatDateOnly(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('nl-BE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
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
         companies ( id, name, contact_name, email, has_maintenance_contract )
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

  const company = Array.isArray(visit.companies) ? visit.companies[0] : visit.companies
  const location = Array.isArray(visit.locations) ? visit.locations[0] : visit.locations
  const hasContract = Boolean(company?.has_maintenance_contract)

  const { data: visitPlants } = await supabase
    .from('maintenance_visit_plants')
    .select(
      `*, plants ( id, nickname, species, reference_code, photo_url, pot_size_code )`
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

  const replacements = (visitPlants ?? []).filter((vp: any) => vp.followup_replace)
  const treated = (visitPlants ?? []).filter((vp: any) => !vp.followup_replace)

  const duration = formatDuration(
    visit.started_at,
    visit.ended_at,
    visit.pause_total_minutes
  )

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

          {!hasContract && duration ? (
            <section className="rounded border border-stera-line bg-white/60 p-4 text-sm">
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
                  const plant = Array.isArray(vp.plants) ? vp.plants[0] : vp.plants
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
            )}
          </section>

          {replacements.length > 0 ? (
            <section>
              <p className="stera-eyebrow text-stera-green mb-2">
                Voorstel: te vervangen planten
              </p>
              <ul className="space-y-4 text-sm">
                {replacements.map((vp: any) => {
                  const plant = Array.isArray(vp.plants) ? vp.plants[0] : vp.plants
                  const photoUrl = vp.photo_url || plant?.photo_url || null
                  const light: 'high' | 'medium' | 'low' | null =
                    vp.replacement_light_level === 'high' ||
                    vp.replacement_light_level === 'medium' ||
                    vp.replacement_light_level === 'low'
                      ? vp.replacement_light_level
                      : null
                  const currentPot = findPotSize(plant?.pot_size_code)
                  const suggestedPot = nextPotSize(plant?.pot_size_code)
                  return (
                    <li
                      key={vp.id}
                      className="overflow-hidden rounded border border-stera-green/30 bg-white"
                    >
                      {/* Bovenkant: huidige plant in slechte staat */}
                      <div className="flex flex-wrap gap-3 border-b border-stera-line bg-red-50/40 p-3">
                        {photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photoUrl}
                            alt={`Huidige plant: ${plant?.nickname || ''}`}
                            className="h-28 w-28 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-xs text-stera-ink-soft">
                            geen foto
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wider text-red-700">
                            Deze plant moet vervangen worden
                          </p>
                          <p className="mt-1 font-semibold">
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
                        </div>
                      </div>

                      {/* Onderkant: voorstel vervanging */}
                      <div className="p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-green">
                          Wij stellen voor te vervangen door
                        </p>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
                          <div>
                            <dt className="text-stera-ink-soft">Licht</dt>
                            <dd className="text-sm font-medium">
                              {light ? LIGHT_LABELS[light] : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-stera-ink-soft">Hoogte</dt>
                            <dd className="text-sm font-medium">
                              {vp.replacement_height_cm
                                ? `± ${vp.replacement_height_cm} cm`
                                : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-stera-ink-soft">Pot-Ø</dt>
                            <dd className="text-sm font-medium">
                              {vp.replacement_pot_diameter_cm
                                ? `${vp.replacement_pot_diameter_cm} cm`
                                : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-stera-ink-soft">Buitenpot</dt>
                            <dd className="text-sm font-medium">
                              {vp.replacement_needs_outer_pot ? 'ja' : 'nee'}
                            </dd>
                          </div>
                        </dl>

                        {suggestedPot ? (
                          <p className="mt-3 rounded bg-stera-green/5 p-2 text-xs">
                            <span className="font-semibold text-stera-green">
                              Voorgestelde nieuwe binnenpot:
                            </span>{' '}
                            {formatPotSize(suggestedPot)} ·{' '}
                            ± {formatEur(suggestedPot.estimatedPriceCents)}
                          </p>
                        ) : null}

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

          {!hasContract && consumables && consumables.length > 0 ? (
            <section>
              <p className="stera-eyebrow text-stera-green mb-2">
                Verbruiksgoederen
              </p>
              {(() => {
                let grandTotal = 0
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
                    grandTotal += lineTotal
                  }
                  return { id: c.id, name, c, lineTotal }
                })
                return (
                  <>
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
