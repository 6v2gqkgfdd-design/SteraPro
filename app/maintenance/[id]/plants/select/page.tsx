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

  const { data: plants, error: plantsError } = await supabase
    .from('plants')
    .select(`
      id,
      nickname,
      species,
      reference_code,
      location_id
    `)
    .eq('location_id', currentLocationId)
    .order('nickname', { ascending: true })

  async function addExistingPlant(formData: FormData) {
    'use server'

    const supabase = await createClient()
    const plantId = formData.get('plant_id')?.toString()

    if (!plantId) {
      redirect(`/maintenance/${id}/plants/select?error=Kies eerst een plant`)
    }

    const { data: existingPlant, error: plantError } = await supabase
      .from('plants')
      .select('id, location_id')
      .eq('id', plantId)
      .single()

    if (plantError || !existingPlant) {
      redirect(`/maintenance/${id}/plants/select?error=Plant niet gevonden`)
    }

    if (existingPlant.location_id !== currentLocationId) {
      redirect(`/maintenance/${id}/plants/select?error=Deze plant hoort niet bij deze locatie`)
    }

    redirect(`/maintenance/${id}/plants/${plantId}`)
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Bestaande plant kiezen</h1>
            <p className="text-sm text-gray-600">
              Onderhoud: {visit.title}
            </p>
            <p className="text-sm text-gray-600">
              Locatie: {locationName}
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href={`/maintenance/${id}/plants`}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Terug
            </Link>

            <Link
              href="/dashboard"
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {query?.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {query.error}
          </div>
        )}

        {plantsError ? (
          <p className="text-red-600">Fout bij ophalen van planten.</p>
        ) : !plants || plants.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-gray-600">
            Er zijn nog geen planten geregistreerd op deze locatie.
          </div>
        ) : (
          <form action={addExistingPlant} className="space-y-5 rounded-xl border p-5">
            <div className="space-y-2">
              <label htmlFor="plant_id" className="block text-sm font-medium">
                Kies een bestaande plant
              </label>
              <select
                id="plant_id"
                name="plant_id"
                defaultValue=""
                required
                className="w-full rounded-lg border px-3 py-2"
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

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-lg bg-black px-4 py-2 text-white"
              >
                Verder naar onderhoud
              </button>

              <Link
                href={`/maintenance/${id}/plants`}
                className="rounded-lg border px-4 py-2"
              >
                Annuleren
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
