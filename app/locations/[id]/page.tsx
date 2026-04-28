import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteLocationButton from '@/components/delete-location-button'

export default async function LocationDetailPage({
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

  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('*, companies(id, name)')
    .eq('id', id)
    .single()

  if (locationError || !location) {
    notFound()
  }

  const { data: plants, error: plantsError } = await supabase
    .from('plants')
    .select('*')
    .eq('location_id', id)
    .order('created_at', { ascending: false })

  return (
    <main className="p-6 space-y-6">
      <div>
        <Link
          href={`/companies/${location.company_id}`}
          className="text-sm underline"
        >
          ← Terug naar bedrijf
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">{location.name}</h1>
        {location.floor && (
          <p className="mt-2 text-gray-600">Verdieping: {location.floor}</p>
        )}
        {location.room && (
          <p className="text-gray-600">Ruimte: {location.room}</p>
        )}
        {location.notes && (
          <p className="mt-3 text-gray-700">{location.notes}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/locations/${location.id}/plants/new`}
          className="inline-block rounded-lg bg-black px-4 py-2 text-white"
        >
          Nieuwe plant
        </Link>

        <Link
          href={`/locations/${location.id}/qr`}
          className="inline-block rounded-lg border px-4 py-2"
        >
          QR-labels
        </Link>

        <DeleteLocationButton
          locationId={location.id}
          companyId={location.company_id}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Planten</h2>

        {plantsError ? (
          <p className="text-red-600">
            Fout bij ophalen planten: {plantsError.message}
          </p>
        ) : !plants || plants.length === 0 ? (
          <p>Nog geen planten toegevoegd.</p>
        ) : (
          <ul className="space-y-3">
            {plants.map((plant) => (
              <li key={plant.id} className="rounded-xl border p-4">
                <Link href={`/plants/${plant.id}`} className="block">
                  <p className="font-semibold">
                    {plant.nickname || plant.plant_code || 'Zonder naam'}
                  </p>

                  {plant.species && (
                    <p className="text-sm text-gray-600">
                      Soort: {plant.species}
                    </p>
                  )}

                  {plant.status && (
                    <p className="text-sm text-gray-600">
                      Status: {plant.status}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {plant.needs_replacement && (
                      <span className="rounded bg-yellow-100 px-2 py-1">
                        Vervangen
                      </span>
                    )}
                    {plant.is_dying && (
                      <span className="rounded bg-orange-100 px-2 py-1">
                        Stervend
                      </span>
                    )}
                    {plant.is_dead && (
                      <span className="rounded bg-red-100 px-2 py-1">
                        Dood
                      </span>
                    )}
                  </div>

                  {plant.notes && (
                    <p className="mt-2 text-sm text-gray-700">
                      {plant.notes}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
