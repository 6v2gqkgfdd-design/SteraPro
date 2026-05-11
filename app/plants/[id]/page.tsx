import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeletePlantButton from '@/components/delete-plant-button'
import RegenerateCareTipsButton from '@/components/regenerate-care-tips-button'
import PlantOverview, {
  type PlantOverviewLocation,
  type PlantOverviewLog,
  type PlantOverviewPlant,
  type PlantOverviewRoom,
} from '@/components/plant-overview'
import PlantReportList, {
  type PlantReportRow,
} from '@/components/plant-report-list'
import { RowMenu, RowMenuItem } from '@/components/row-menu'

type PlantRow = PlantOverviewPlant & {
  room_id?: string | null
}

export default async function PlantDetailPage({
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

  const { data: plant, error: plantError } = await supabase
    .from('plants')
    .select(
      'id, qr_slug, nickname, plant_code, reference_code, species, status, notes, photo_url, location_id, room_id, is_dead, is_dying, needs_replacement, care_tips, is_artificial'
    )
    .eq('id', id)
    .maybeSingle()

  if (plantError || !plant) {
    notFound()
  }

  const typedPlant = plant as PlantRow

  const [
    { data: latestStandaloneLog },
    { data: latestVisitPlant },
    { data: location },
    { data: room },
    { data: reports },
  ] = await Promise.all([
    supabase
      .from('plant_maintenance_logs')
      .select(
        'performed_at, watered, pruned, dusted, rotated, fed, pest_treated, repotted, soil_refreshed, polished, notes'
      )
      .eq('plant_id', typedPlant.id)
      .order('performed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('maintenance_visit_plants')
      .select(
        `notes, action_watered, action_pruned, action_cleaned, action_rotated,
         action_fed, action_repotted, action_replaced, action_checked,
         action_polished,
         maintenance_visits ( id, scheduled_start, started_at, ended_at )`
      )
      .eq('plant_id', typedPlant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    typedPlant.location_id
      ? supabase
          .from('locations')
          .select('id, name, street, number, postal_code, city, country')
          .eq('id', typedPlant.location_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    typedPlant.room_id
      ? supabase
          .from('rooms')
          .select('id, name, floor')
          .eq('id', typedPlant.room_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('plant_reports')
      .select(
        'id, plant_id, issue_type, message, reporter_name, reporter_email, status, created_at, handled_at'
      )
      .eq('plant_id', typedPlant.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // Bouw een PlantOverviewLog uit de meest recente visit_plant rij.
  let visitLog: PlantOverviewLog = null
  if (latestVisitPlant) {
    const v = Array.isArray(latestVisitPlant.maintenance_visits)
      ? latestVisitPlant.maintenance_visits[0]
      : latestVisitPlant.maintenance_visits
    const when = v?.ended_at || v?.started_at || v?.scheduled_start || null
    if (when) {
      visitLog = {
        performed_at: when,
        watered: latestVisitPlant.action_watered,
        pruned: latestVisitPlant.action_pruned,
        dusted: latestVisitPlant.action_cleaned,
        rotated: latestVisitPlant.action_rotated,
        fed: latestVisitPlant.action_fed,
        pest_treated: false,
        repotted: latestVisitPlant.action_repotted,
        soil_refreshed: false,
        polished: latestVisitPlant.action_polished,
        notes: latestVisitPlant.notes,
      }
    }
  }

  // Kies de meest recente tussen het oude standalone-log en de visit-log.
  const tStandalone = latestStandaloneLog?.performed_at
    ? Date.parse(latestStandaloneLog.performed_at)
    : 0
  const tVisit = visitLog?.performed_at ? Date.parse(visitLog.performed_at) : 0
  const latestLog: PlantOverviewLog =
    tVisit > tStandalone ? visitLog : (latestStandaloneLog as PlantOverviewLog)

  const reportRows = (reports ?? []) as PlantReportRow[]

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <PlantOverview
          plant={typedPlant}
          location={(location ?? null) as PlantOverviewLocation}
          room={(room ?? null) as PlantOverviewRoom}
          latestLog={(latestLog ?? null) as PlantOverviewLog}
          actions={
            <div className="flex items-center justify-between gap-3">
              {typedPlant.species ? (
                <RegenerateCareTipsButton
                  plantId={typedPlant.id}
                  hasTips={Boolean(typedPlant.care_tips)}
                />
              ) : (
                <span />
              )}
              <RowMenu>
                <RowMenuItem
                  href={`/plants/${typedPlant.id}/maintenance/new`}
                >
                  Onderhoud registreren
                </RowMenuItem>
                <RowMenuItem href={`/plants/${typedPlant.id}/edit`}>
                  Plant bewerken
                </RowMenuItem>
                {typedPlant.qr_slug ? (
                  <RowMenuItem href={`/p/${typedPlant.qr_slug}`}>
                    Klantweergave openen
                  </RowMenuItem>
                ) : null}
                {typedPlant.location_id ? (
                  <>
                    <div className="border-t border-stera-line" />
                    <DeletePlantButton
                      plantId={typedPlant.id}
                      locationId={typedPlant.location_id}
                      variant="menu"
                    />
                  </>
                ) : null}
              </RowMenu>
            </div>
          }
        />

        {reportRows.length > 0 ? (
          <PlantReportList reports={reportRows} />
        ) : null}
      </div>
    </main>
  )
}
