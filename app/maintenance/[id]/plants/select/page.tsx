import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function MaintenancePlantSelectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : {}
  const supabase = await createClient()

  const { data: visit, error: visitError } = await supabase
    .from('maintenance_visits')
    .select(`
      id,
      title,
      location_id,
      locations (
        id,
        name
      ),
      maintenance_visit_rooms (
        rooms ( id, name )
      )
    `)
    .eq('id', id)
    .single()

  if (visitError || !visit) {
    return (
      <main className="p-6">
        <p className="text-red-600">Onderhoudsbeurt niet gevonden.</p>
      </main>
    )
  }

  const currentLocationId = visit.location_id
  const locationData = visit.locations as any
  const locationName = Array.isArray(locationData)
    ? (locationData[0]?.name || 'Onbekende locatie')
    : (locationData?.name || 'Onbekende locatie')

  // Gekoppelde ruimtes — als die er zijn, scopen we de planten-lijst
  // tot die ruimtes. Zo niet: alle planten op de locatie.
  const visitRooms: Array<{ id: string; name: string | null }> = Array.isArray(
    visit.maintenance_visit_rooms
  )
    ? visit.maintenance_visit_rooms
        .map((mvr: any) => {
          const r = Array.isArray(mvr.rooms) ? mvr.rooms[0] : mvr.rooms
          return r as { id: string; name: string | null } | null
        })
        .filter((r): r is { id: string; name: string | null } => Boolean(r))
    : []
  const visitRoomIds = visitRooms.map((r) => r.id)
  const visitRoomLabel = visitRooms
    .map((r) => r.name)
    .filter(Boolean)
    .join(', ')

  let plantsQuery = supabase
    .from('plants')
    .select(`id, nickname, species, reference_code, location_id, room_id`)
  if (visitRoomIds.length > 0) {
    plantsQuery = plantsQuery.in('room_id', visitRoomIds)
  } else {
    plantsQuery = plantsQuery.eq('location_id', currentLocationId)
  }
  const { data: plants, error: plantsError } = await plantsQuery.order(
    'nickname',
    { ascending: true }
  )

  async function addExistingPlant(formData: FormData) {
    'use server'

    const supabase = await createClient()
    const plantId = formData.get('plant_id')?.toString()

    if (!plantId) {
      redirect(`/maintenance/${id}/plants/select?error=Kies eerst een plant`)
    }

    const { data: existingPlant, error: plantError } = await supabase
      .from('plants')
      .select('id, location_id, room_id')
      .eq('id', plantId)
      .single()

    if (plantError || !existingPlant) {
      redirect(`/maintenance/${id}/plants/select?error=Plant niet gevonden`)
    }

    if (visitRoomIds.length > 0) {
      if (
        !existingPlant.room_id ||
        !visitRoomIds.includes(existingPlant.room_id)
      ) {
        redirect(
          `/maintenance/${id}/plants/select?error=Deze plant hoort niet bij een ruimte van deze beurt`
        )
      }
    } else if (existingPlant.location_id !== currentLocationId) {
      redirect(
        `/maintenance/${id}/plants/select?error=Deze plant hoort niet bij deze locatie`
      )
    }

    redirect(`/maintenance/${id}/plants/${plantId}`)
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="stera-eyebrow mb-2">Onderhoud · Planten</p>
            <h1 className="stera-display text-3xl sm:text-4xl">Bestaande plant kiezen</h1>
            <p className="mt-2 text-sm text-stera-ink-soft">Onderhoud: {visit.title}</p>
            <p className="text-sm text-stera-ink-soft">
              Locatie: {locationName}
              {visitRoomLabel ? ` · ${visitRoomLabel}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/maintenance/${id}`}
              className="stera-cta stera-cta-ghost"
            >
              Terug
            </Link>
          </div>
        </div>

        {query?.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        )}

        {plantsError ? (
          <p className="text-red-600">Fout bij ophalen van planten.</p>
        ) : !plants || plants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stera-line p-6 text-sm text-stera-ink-soft">
            {visitRoomLabel
              ? `Er zijn nog geen planten in ${visitRoomLabel}.`
              : 'Er zijn nog geen planten geregistreerd op deze locatie.'}
          </div>
        ) : (
          <form action={addExistingPlant} className="stera-card space-y-5">
            <div className="space-y-2">
              <label htmlFor="plant_id" className="block text-sm font-medium">
                Kies een bestaande plant
              </label>
              <select
                id="plant_id"
                name="plant_id"
                defaultValue=""
                required
                className="w-full rounded-lg border border-stera-line bg-white px-3 py-3"
              >
                <option value="" disabled>
                  Selecteer een plant
                </option>
                {plants.map((plant: any) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.nickname || 'Zonder naam'} — {plant.species || 'Onbekende soort'} ({plant.reference_code || 'Geen code'})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="stera-cta stera-cta-primary"
            >
              Verder naar onderhoud
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
