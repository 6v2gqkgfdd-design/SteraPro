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
      'id, qr_slug, nickname, plant_code, reference_code, species, status, notes, photo_url, location_id, room_id, is_dead, is_dying, needs_replacement, care_tips'
    )
    .eq('id', id)
    .maybeSingle()

  if (plantError || !plant) {
    notFound()
  }

  const typedPlant = plant as PlantRow

  const [{ data: latestLog }, { data: location }, { data: room }] =
    await Promise.all([
      supabase
        .from('plant_maintenance_logs')
        .select(
          'performed_at, watered, pruned, dusted, rotated, fed, pest_treated, repotted, soil_refreshed, polished, notes'
        )
        .eq('plant_id', typedPlant.id)
        .order('performed_at', { ascending: false })
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
    ])

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/dashboard" className="stera-cta stera-cta-ghost">
          ← Dashboard
        </Link>

        <PlantOverview
          plant={typedPlant}
          location={(location ?? null) as PlantOverviewLocation}
          room={(room ?? null) as PlantOverviewRoom}
          latestLog={(latestLog ?? null) as PlantOverviewLog}
          actions={
            <>
              <Link
                href={`/plants/${typedPlant.id}/maintenance/new`}
                className="stera-cta stera-cta-primary"
              >
                Onderhoud registreren
              </Link>
              <Link
                href={`/plants/${typedPlant.id}/edit`}
                className="stera-cta stera-cta-secondary"
              >
                Plant bewerken
              </Link>
              {typedPlant.species ? (
                <RegenerateCareTipsButton
                  plantId={typedPlant.id}
                  hasTips={Boolean(typedPlant.care_tips)}
                />
              ) : null}
              {typedPlant.qr_slug ? (
                <Link
                  href={`/p/${typedPlant.qr_slug}`}
                  className="stera-cta stera-cta-ghost"
                >
                  Klantweergave openen →
                </Link>
              ) : null}
              {typedPlant.location_id ? (
                <DeletePlantButton
                  plantId={typedPlant.id}
                  locationId={typedPlant.location_id}
                />
              ) : null}
            </>
          }
        />
      </div>
    </main>
  )
}
