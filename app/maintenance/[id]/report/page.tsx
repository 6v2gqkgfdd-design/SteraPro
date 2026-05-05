import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrintButton from './print-button'

const ACTION_LABELS: Record<string, string> = {
  action_checked: 'Plant gecontroleerd',
  action_watered: 'Water gegeven',
  action_pruned: 'Gesnoeid',
  action_fed: 'Voeding toegevoegd',
  action_cleaned: 'Bladeren gereinigd',
  action_rotated: 'Gedraaid',
  action_repotted: 'Verpot',
  action_replaced: 'Vervangen',
}

const HEALTH_LABELS: Record<string, string> = {
  healthy: 'Gezond',
  needs_attention: 'Heeft aandacht nodig',
  maintenance_due: 'Onderhoud vereist',
  replacement_needed: 'Vervanging nodig',
  dead: 'Dood',
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null
  const d = new Date(value)
  return d.toLocaleString('nl-BE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value: string | null | undefined) {
  if (!value) return null
  const d = new Date(value)
  return d.toLocaleDateString('nl-BE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatDuration(start: string | null, end: string | null, pauseMin: number | null) {
  if (!start || !end) return null
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  const totalMin = Math.max(0, Math.round((endMs - startMs) / 60000))
  const workMin = Math.max(0, totalMin - (pauseMin ?? 0))
  const h = Math.floor(workMin / 60)
  const m = workMin % 60
  return h > 0 ? `${h}u ${m.toString().padStart(2, '0')}min` : `${m}min`
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function getActiveActions(row: Record<string, unknown>) {
  return Object.entries(ACTION_LABELS)
    .filter(([key]) => Boolean(row[key]))
    .map(([, label]) => label)
}

export default async function MaintenanceReportPage({
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

  const { data: visit, error: visitError } = await supabase
    .from('maintenance_visits')
    .select(
      `
      *,
      locations (
        id,
        name,
        floor,
        room,
        notes
      ),
      companies (
        id,
        name,
        contact_name,
        email
      )
      `
    )
    .eq('id', id)
    .maybeSingle()

  if (visitError || !visit) {
    notFound()
  }

  const { data: visitPlants } = await supabase
    .from('maintenance_visit_plants')
    .select(
      `
      *,
      plants (
        id,
        nickname,
        species,
        reference_code,
        plant_code,
        photo_url
      )
      `
    )
    .eq('visit_id', id)
    .order('created_at', { ascending: true })

  const { data: consumables } = await supabase
    .from('maintenance_visit_consumables')
    .select(
      `
      id,
      catalog_item_id,
      custom_name,
      quantity,
      unit,
      notes,
      consumable_catalog (
        id,
        name
      )
      `
    )
    .eq('visit_id', id)
    .order('created_at', { ascending: true })

  const company = (visit as { companies?: { name?: string; contact_name?: string; email?: string } }).companies
  const location = (visit as { locations?: { name?: string; floor?: string; room?: string } }).locations

  const startedAt = formatDateTime(visit.started_at)
  const endedAt = formatDateTime(visit.ended_at)
  const scheduledFor = formatDate(visit.scheduled_start)
  const duration = formatDuration(visit.started_at, visit.ended_at, visit.pause_total_minutes)
  const reportDate = formatDate(visit.ended_at || visit.scheduled_start || visit.created_at)

  return (
    <main className="min-h-screen bg-[#F5F0E8] text-stera-ink print:bg-white">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-10 sm:py-12 print:px-0 print:py-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stera-line pb-6 mb-8 print:hidden">
          <Link
            href={`/maintenance/${id}`}
            className="text-sm underline"
          >
            ← Terug naar onderhoud
          </Link>
          <PrintButton />
        </div>

        <header className="mb-10">
          <p className="stera-eyebrow text-stera-blue mb-3">Onderhoudsrapport</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            {visit.title || 'Onderhoudsbeurt'}
          </h1>
          {reportDate ? (
            <p className="text-base text-stera-ink-soft">{reportDate}</p>
          ) : null}
        </header>

        <section className="mb-10 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="stera-eyebrow text-stera-blue mb-2">Klant</p>
            <p className="font-semibold">{company?.name || '—'}</p>
            {company?.contact_name ? (
              <p className="text-sm text-stera-ink-soft">t.a.v. {company.contact_name}</p>
            ) : null}
          </div>

          <div>
            <p className="stera-eyebrow text-stera-blue mb-2">Locatie</p>
            <p className="font-semibold">{location?.name || '—'}</p>
            {(location?.floor || location?.room) ? (
              <p className="text-sm text-stera-ink-soft">
                {[location?.floor, location?.room].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
        </section>

        <section className="mb-10 rounded border border-stera-line bg-white/60 p-5 print:bg-transparent">
          <p className="stera-eyebrow text-stera-blue mb-3">Tijdsregistratie</p>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
            {startedAt ? (
              <div className="flex justify-between sm:block">
                <dt className="text-stera-ink-soft">Start</dt>
                <dd className="font-medium">{startedAt}</dd>
              </div>
            ) : null}
            {endedAt ? (
              <div className="flex justify-between sm:block">
                <dt className="text-stera-ink-soft">Einde</dt>
                <dd className="font-medium">{endedAt}</dd>
              </div>
            ) : null}
            {duration ? (
              <div className="flex justify-between sm:block">
                <dt className="text-stera-ink-soft">Werkduur</dt>
                <dd className="font-medium">{duration}</dd>
              </div>
            ) : null}
            {typeof visit.pause_total_minutes === 'number' && visit.pause_total_minutes > 0 ? (
              <div className="flex justify-between sm:block">
                <dt className="text-stera-ink-soft">Pauze</dt>
                <dd className="font-medium">{visit.pause_total_minutes} min</dd>
              </div>
            ) : null}
            {!startedAt && scheduledFor ? (
              <div className="flex justify-between sm:block">
                <dt className="text-stera-ink-soft">Gepland voor</dt>
                <dd className="font-medium">{scheduledFor}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {visit.planned_tasks ? (
          <section className="mb-10">
            <p className="stera-eyebrow text-stera-blue mb-3">Geplande taken</p>
            <p className="whitespace-pre-wrap text-sm text-stera-ink leading-relaxed">
              {visit.planned_tasks}
            </p>
          </section>
        ) : null}

        <section className="mb-10">
          <p className="stera-eyebrow text-stera-blue mb-3">Behandelde planten</p>

          {!visitPlants || visitPlants.length === 0 ? (
            <p className="text-sm text-stera-ink-soft">Geen planten geregistreerd.</p>
          ) : (
            <ul className="space-y-4">
              {visitPlants.map((vp: any) => {
                const plant = Array.isArray(vp.plants) ? vp.plants[0] : vp.plants
                const actions = getActiveActions(vp)
                return (
                  <li
                    key={vp.id}
                    className="rounded border border-stera-line bg-white/60 p-4 print:bg-transparent"
                  >
                    <div className="flex flex-wrap gap-4">
                      {vp.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={vp.photo_url}
                          alt={`Foto van ${plant?.nickname || 'plant'} tijdens dit onderhoud`}
                          className="h-32 w-32 shrink-0 rounded object-cover"
                        />
                      ) : plant?.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={plant.photo_url}
                          alt={plant?.nickname || 'Plant'}
                          className="h-24 w-24 shrink-0 rounded object-cover opacity-80"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {plant?.nickname || plant?.reference_code || plant?.plant_code || 'Plant'}
                        </p>
                        {plant?.species ? (
                          <p className="text-sm text-stera-ink-soft">{plant.species}</p>
                        ) : null}
                        {plant?.reference_code ? (
                          <p className="text-xs font-mono text-stera-ink-soft">
                            {plant.reference_code}
                          </p>
                        ) : null}

                        {vp.new_plant ? (
                          <p className="mt-2 inline-block rounded bg-stera-blue/10 px-2 py-0.5 text-xs font-medium text-stera-blue">
                            Nieuw toegevoegd
                          </p>
                        ) : null}

                        {actions.length > 0 ? (
                          <ul className="mt-2 flex flex-wrap gap-2">
                            {actions.map((label) => (
                              <li
                                key={label}
                                className="rounded border border-stera-line px-2 py-0.5 text-xs"
                              >
                                {label}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {vp.health_status && HEALTH_LABELS[vp.health_status] ? (
                          <p className="mt-2 text-sm">
                            <span className="text-stera-ink-soft">Status na onderhoud: </span>
                            <span className="font-medium">
                              {HEALTH_LABELS[vp.health_status]}
                            </span>
                          </p>
                        ) : null}

                        {vp.notes ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-stera-ink">
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

        <section className="mb-10">
          <p className="stera-eyebrow text-stera-blue mb-3">Verbruiksgoederen</p>

          {!consumables || consumables.length === 0 ? (
            <p className="text-sm text-stera-ink-soft">Geen verbruiksgoederen geregistreerd.</p>
          ) : (
            <ul className="divide-y divide-stera-line rounded border border-stera-line bg-white/60 print:bg-transparent">
              {consumables.map((c: any) => {
                const catalog = Array.isArray(c.consumable_catalog)
                  ? c.consumable_catalog[0]
                  : c.consumable_catalog
                const name = c.custom_name || catalog?.name || 'Verbruik'
                return (
                  <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                    <span className="font-medium">{name}</span>
                    <span className="text-sm">
                      {formatQuantity(Number(c.quantity))}
                      {c.unit ? ` ${c.unit}` : ''}
                    </span>
                    {c.notes ? (
                      <span className="basis-full text-xs text-stera-ink-soft">
                        {c.notes}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {visit.general_notes ? (
          <section className="mb-10">
            <p className="stera-eyebrow text-stera-blue mb-3">Algemene notities</p>
            <p className="whitespace-pre-wrap text-sm text-stera-ink leading-relaxed">
              {visit.general_notes}
            </p>
          </section>
        ) : null}

        <footer className="mt-12 border-t border-stera-line pt-6 text-xs text-stera-ink-soft">
          <p className="stera-wordmark text-stera-ink text-sm mb-1">
            Stéra<span className="text-stera-blue">Pro</span>
          </p>
          <p>Opgemaakt door Stera · Plantbeheer voor professionals</p>
          {visit.report_sent_at ? (
            <p className="mt-1">
              Rapport verzonden op {formatDateTime(visit.report_sent_at)}
            </p>
          ) : null}
        </footer>
      </div>
    </main>
  )
}
