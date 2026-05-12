import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import MaintenanceActions from './maintenance-actions'
import VisitConsumables from './visit-consumables'
import VisitManagement from './visit-management'
import { applyStandardMaintenance } from './standard-actions'
import { RowMenu } from '@/components/row-menu'
import { formatRoomLabel } from '@/lib/rooms'

type FollowupItem = {
  plantId: string
  plantName: string
  flags: {
    repot: boolean
    prune: boolean
    replace: boolean
    treat: boolean
  }
  notes: string | null
  replacement: {
    light: 'high' | 'medium' | 'low' | null
    heightCm: number | null
    potDiameterCm: number | null
    needsOuterPot: boolean
    notes: string | null
  } | null
}

const LIGHT_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: 'Veel licht',
  medium: 'Matig licht',
  low: 'Weinig licht',
}

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: visit, error } = await supabase
    .from('maintenance_visits')
    .select(`
      *,
      companies ( id, name ),
      locations (
        id,
        name,
        street,
        number,
        city
      ),
      maintenance_visit_rooms (
        rooms ( id, name, floor )
      )
    `)
    .eq('id', id)
    .single()

  // Werkbon voor deze beurt (voor de actie-knoppen).
  const { data: workOrderRow } = await supabase
    .from('work_orders')
    .select('id, status')
    .eq('visit_id', id)
    .maybeSingle()

  const { data: visitPlants } = await supabase
    .from('maintenance_visit_plants')
    .select(`
      *,
      plants (
        id,
        nickname,
        species,
        reference_code
      )
    `)
    .eq('visit_id', id)
    .order('created_at', { ascending: true })

  if (error || !visit) {
    return (
      <main className="p-6">
        <p className="text-red-600">Onderhoudsbeurt niet gevonden.</p>
      </main>
    )
  }

  // Hoeveel planten zitten in scope (alleen de geselecteerde ruimtes
  // van deze visit, of alle planten op de locatie als er geen ruimtes
  // expliciet gekozen zijn).
  const visitRoomIds: string[] = Array.isArray(visit.maintenance_visit_rooms)
    ? visit.maintenance_visit_rooms
        .map((mvr: any) => {
          const r = Array.isArray(mvr.rooms) ? mvr.rooms[0] : mvr.rooms
          return (r?.id as string | undefined) || null
        })
        .filter((v: string | null): v is string => Boolean(v))
    : []

  let scopedPlantCount = 0
  if (visitRoomIds.length > 0) {
    const { count } = await supabase
      .from('plants')
      .select('id', { count: 'exact', head: true })
      .in('room_id', visitRoomIds)
    scopedPlantCount = count ?? 0
  } else if (visit.location_id) {
    const { count } = await supabase
      .from('plants')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', visit.location_id)
    scopedPlantCount = count ?? 0
  }

  const handledCount = (visitPlants ?? []).length
  const pendingPlantCount = Math.max(0, scopedPlantCount - handledCount)

  // Naam van de scope om in de knop te tonen ('in Kantoren verdiep 1, ...').
  const scopeRoomLabel: string =
    visitRoomIds.length > 0 && Array.isArray(visit.maintenance_visit_rooms)
      ? visit.maintenance_visit_rooms
          .map((mvr: any) => {
            const r = Array.isArray(mvr.rooms) ? mvr.rooms[0] : mvr.rooms
            return r ? formatRoomLabel(r.name, r.floor) : null
          })
          .filter((n: string | null): n is string => Boolean(n))
          .join(', ')
      : ''

  // ── Voorbereidingslijst: zoek de meest recente AFGESLOTEN beurt op
  // dezelfde locatie vóór deze beurt en aggregeer alle follow-up flags
  // die de techn. tijdens die beurt heeft aangevinkt.
  let followupItems: FollowupItem[] = []
  let followupSourceDate: string | null = null

  const isOpenVisit = visit.status !== 'completed'

  if (isOpenVisit && visit.location_id) {
    const cutoff = visit.scheduled_start || visit.created_at
    const { data: previousVisit } = await supabase
      .from('maintenance_visits')
      .select('id, ended_at, scheduled_start')
      .eq('location_id', visit.location_id)
      .eq('status', 'completed')
      .lt('scheduled_start', cutoff)
      .order('scheduled_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (previousVisit?.id) {
      followupSourceDate = previousVisit.ended_at || previousVisit.scheduled_start
      const { data: previousVisitPlants } = await supabase
        .from('maintenance_visit_plants')
        .select(
          `id, plant_id, followup_repot, followup_prune, followup_replace,
           followup_treat, followup_notes,
           replacement_light_level, replacement_height_cm,
           replacement_pot_diameter_cm, replacement_needs_outer_pot,
           replacement_notes,
           plants ( id, nickname, species, reference_code )`
        )
        .eq('visit_id', previousVisit.id)

      followupItems = (previousVisitPlants ?? [])
        .filter(
          (row: any) =>
            row.followup_repot ||
            row.followup_prune ||
            row.followup_replace ||
            row.followup_treat ||
            (row.followup_notes && row.followup_notes.trim())
        )
        .map((row: any) => {
          const plant = Array.isArray(row.plants) ? row.plants[0] : row.plants
          const plantName =
            plant?.nickname ||
            plant?.species ||
            plant?.reference_code ||
            'Plant'
          const isReplacement = Boolean(row.followup_replace)
          return {
            plantId: row.plant_id,
            plantName,
            flags: {
              repot: Boolean(row.followup_repot),
              prune: Boolean(row.followup_prune),
              replace: isReplacement,
              treat: Boolean(row.followup_treat),
            },
            notes: row.followup_notes || null,
            replacement: isReplacement
              ? {
                  light:
                    row.replacement_light_level === 'high' ||
                    row.replacement_light_level === 'medium' ||
                    row.replacement_light_level === 'low'
                      ? row.replacement_light_level
                      : null,
                  heightCm:
                    typeof row.replacement_height_cm === 'number'
                      ? row.replacement_height_cm
                      : null,
                  potDiameterCm:
                    typeof row.replacement_pot_diameter_cm === 'number'
                      ? row.replacement_pot_diameter_cm
                      : null,
                  needsOuterPot: Boolean(row.replacement_needs_outer_pot),
                  notes: row.replacement_notes || null,
                }
              : null,
          } as FollowupItem
        })
    }
  }

  const followupCounts = followupItems.reduce(
    (acc, item) => {
      if (item.flags.repot) acc.repot += 1
      if (item.flags.prune) acc.prune += 1
      if (item.flags.replace) acc.replace += 1
      if (item.flags.treat) acc.treat += 1
      return acc
    },
    { repot: 0, prune: 0, replace: 0, treat: 0 }
  )

  const benodigdheden: { label: string; count: number }[] = []
  if (followupCounts.repot > 0)
    benodigdheden.push({
      label: `${followupCounts.repot}× verpotten — potten · verpotaarde · onderzetters`,
      count: followupCounts.repot,
    })
  if (followupCounts.prune > 0)
    benodigdheden.push({
      label: `${followupCounts.prune}× snoeien — snoeischaar · handschoenen`,
      count: followupCounts.prune,
    })
  if (followupCounts.replace > 0)
    benodigdheden.push({
      label: `${followupCounts.replace}× vervanging — nieuwe plant of stek`,
      count: followupCounts.replace,
    })
  if (followupCounts.treat > 0)
    benodigdheden.push({
      label: `${followupCounts.treat}× behandeling — verzorgingsmiddel`,
      count: followupCounts.treat,
    })

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-stera-ink sm:text-3xl">
              {(Array.isArray(visit.companies)
                ? visit.companies[0]?.name
                : visit.companies?.name) || 'Onbekende klant'}
            </h1>
            <p className="mt-1 text-sm text-stera-ink-soft">
              {[
                visit.locations?.name,
                [visit.locations?.street, visit.locations?.number]
                  .filter(Boolean)
                  .join(' ') || null,
                visit.locations?.city,
              ]
                .filter(Boolean)
                .join(' · ') || 'Geen locatie-info'}
            </p>
            <p className="text-sm text-stera-ink-soft">
              {visit.scheduled_start
                ? new Date(visit.scheduled_start).toLocaleString('nl-BE', {
                    timeZone: 'Europe/Brussels',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : 'Geen datum'}
            </p>
            {Array.isArray(visit.maintenance_visit_rooms) &&
              visit.maintenance_visit_rooms.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {visit.maintenance_visit_rooms.map((mvr: any, i: number) => {
                    const r = Array.isArray(mvr.rooms) ? mvr.rooms[0] : mvr.rooms
                    if (!r) return null
                    return (
                      <span
                        key={r.id || i}
                        className="inline-block rounded-full bg-stera-green/10 px-3 py-1 text-xs font-medium text-stera-green"
                      >
                        {formatRoomLabel(r.name, r.floor)}
                      </span>
                    )
                  })}
                </div>
              )}
          </div>
          <VisitManagement
            visitId={visit.id}
            status={visit.status}
            workOrder={workOrderRow ?? null}
            variant="menu"
          />
        </div>

        <div className="stera-card">
          <p className="stera-eyebrow mb-2">Vandaag te doen</p>
          <ul className="space-y-2 text-sm text-stera-ink">
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-stera-green" />
              <span>
                Standaard onderhoud uitvoeren op alle gezonde planten (water,
                voeding, snoei, controle, draaien, bladglans).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-stera-green" />
              <span>
                Zieke planten of planten die vervangen moeten worden apart
                scannen en registreren.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-stera-green" />
              <span>
                Nieuwe planten meebrengen die werden besteld na het vorige
                onderhoud (zie Voorbereiding hieronder).
              </span>
            </li>
          </ul>
          {visit.planned_tasks ? (
            <p className="mt-4 whitespace-pre-wrap rounded bg-stera-cream-deep/40 p-3 text-sm text-stera-ink-soft">
              {visit.planned_tasks}
            </p>
          ) : null}
        </div>

        <div className="stera-card">
          <p className="stera-eyebrow mb-3">Tijdsregistratie</p>
          <MaintenanceActions visit={visit} />
        </div>

        {isOpenVisit && pendingPlantCount > 0 ? (
          <div className="stera-card border-stera-green/40 bg-stera-cream-deep/40">
            <p className="stera-eyebrow mb-2">Snel afronden</p>
            <p className="text-sm text-stera-ink">
              Er staan nog {pendingPlantCount} plant
              {pendingPlantCount === 1 ? '' : 'en'}
              {scopeRoomLabel ? ` in ${scopeRoomLabel}` : ''} zonder
              registratie. Pas in één klik het standaard onderhoud toe (water,
              voeding, snoei, controle, draaien, bladglans).
            </p>
            <p className="mt-1 text-xs text-stera-ink-soft">
              Zieke planten of vervangingen scan je apart vóór je deze knop
              gebruikt — die overschrijft niet wat je al ingaf.
            </p>
            <form action={applyStandardMaintenance} className="mt-3">
              <input type="hidden" name="visit_id" value={visit.id} />
              <button type="submit" className="stera-cta stera-cta-primary">
                Pas standaard onderhoud toe op {pendingPlantCount} plant
                {pendingPlantCount === 1 ? '' : 'en'} →
              </button>
            </form>
          </div>
        ) : null}

        <div className="stera-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="stera-eyebrow">Behandelde planten</p>

            <div className="flex items-center gap-2">
              <Link
                href={`/maintenance/${id}/plants/scan`}
                title="QR-code scannen"
                aria-label="Plant scannen"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-stera-line bg-white text-stera-ink transition hover:border-stera-green hover:text-stera-green"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 18h2M18 14h3" />
                </svg>
              </Link>

              <Link
                href={`/maintenance/${id}/plants/select`}
                title="Bestaande plant kiezen"
                aria-label="Bestaande plant kiezen"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-stera-line bg-white text-stera-ink transition hover:border-stera-green hover:text-stera-green"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h13M3 12h13M3 18h10" />
                  <circle cx="20" cy="6" r="1.4" />
                  <circle cx="20" cy="12" r="1.4" />
                  <circle cx="17" cy="18" r="1.4" />
                </svg>
              </Link>

              <Link
                href={`/maintenance/${id}/plants/new`}
                title="Nieuwe plant toevoegen"
                aria-label="Nieuwe plant toevoegen"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-stera-green text-white transition hover:bg-stera-green/90"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            {visitPlants?.map((item: any) => (
              <Link
                key={item.id}
                href={`/maintenance/${id}/plants/${item.plant_id}`}
                className="flex flex-wrap gap-3 rounded-lg border border-stera-line bg-stera-cream-deep p-3 transition hover:border-stera-green"
              >
                {item.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photo_url}
                    alt="Foto van plant tijdens onderhoud"
                    className="h-20 w-20 shrink-0 rounded object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.plants?.nickname || 'Plant'}
                  </p>
                  <p className="text-sm text-stera-ink-soft">
                    {item.plants?.species || 'Onbekende soort'} • {item.plants?.reference_code}
                  </p>
                  {item.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-stera-ink-soft">
                      {item.notes}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}

            {!visitPlants?.length && (
              <p className="text-sm text-stera-ink-soft">
                Nog geen planten toegevoegd aan deze onderhoudsbeurt.
              </p>
            )}
          </div>
        </div>

        <div className="stera-card">
          <VisitConsumables
            visitId={visit.id}
            locked={
              workOrderRow?.status === 'signed' ||
              workOrderRow?.status === 'invoiced'
            }
          />
        </div>
      </div>
    </main>
  )
}
