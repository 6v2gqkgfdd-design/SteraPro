import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeletePlantButton from '@/components/delete-plant-button'

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
    .select('*')
    .eq('id', id)
    .single()

  if (plantError || !plant) {
    notFound()
  }

  const { data: logs, error: logsError } = await supabase
    .from('plant_maintenance_logs')
    .select('*')
    .eq('plant_id', id)
    .order('performed_at', { ascending: false })

  return (
    <main className="p-6 space-y-6">
      <div>
        <Link
          href={`/locations/${plant.location_id}`}
          className="text-sm underline"
        >
          ← Terug naar locatie
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">
          {plant.nickname || plant.plant_code || 'Plant'}
        </h1>

        {plant.plant_code && (
          <p className="mt-2 text-gray-600">Plantcode: {plant.plant_code}</p>
        )}

        {plant.species && (
          <p className="text-gray-600">Soort: {plant.species}</p>
        )}

        {plant.status && (
          <p className="text-gray-600">Status: {plant.status}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
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
          <p className="mt-3 text-gray-700">{plant.notes}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/plants/${plant.id}/maintenance/new`}
          className="inline-block rounded-lg bg-black px-4 py-2 text-white"
        >
          Onderhoud registreren
        </Link>

        <DeletePlantButton
          plantId={plant.id}
          locationId={plant.location_id}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Onderhoudshistoriek</h2>

        {logsError ? (
          <p className="text-red-600">
            Fout bij ophalen onderhoudslogs: {logsError.message}
          </p>
        ) : !logs || logs.length === 0 ? (
          <p>Nog geen onderhoud geregistreerd.</p>
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => (
              <li key={log.id} className="rounded-xl border p-4">
                <p className="font-semibold">
                  {new Date(log.performed_at).toLocaleString()}
                </p>

                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {log.watered && <span className="rounded bg-blue-100 px-2 py-1">Water</span>}
                  {log.pruned && <span className="rounded bg-green-100 px-2 py-1">Gesnoeid</span>}
                  {log.dusted && <span className="rounded bg-gray-100 px-2 py-1">Stofvrij</span>}
                  {log.rotated && <span className="rounded bg-purple-100 px-2 py-1">Gedraaid</span>}
                  {log.fed && <span className="rounded bg-lime-100 px-2 py-1">Voeding</span>}
                  {log.pest_treated && <span className="rounded bg-amber-100 px-2 py-1">Plagen</span>}
                  {log.repotted && <span className="rounded bg-emerald-100 px-2 py-1">Verpot</span>}
                  {log.soil_refreshed && <span className="rounded bg-stone-100 px-2 py-1">Verse aarde</span>}
                  {log.polished && <span className="rounded bg-cyan-100 px-2 py-1">Opgeblonken</span>}
                  {log.replaced && <span className="rounded bg-yellow-200 px-2 py-1">Vervangen</span>}
                  {log.needs_replacement && <span className="rounded bg-yellow-100 px-2 py-1">Vervanging nodig</span>}
                  {log.is_dying && <span className="rounded bg-orange-100 px-2 py-1">Stervend</span>}
                  {log.is_dead && <span className="rounded bg-red-100 px-2 py-1">Dood</span>}
                </div>

                {log.notes && (
                  <p className="mt-2 text-sm text-gray-700">{log.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
