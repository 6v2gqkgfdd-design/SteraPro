import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function PublicPlantPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: plant, error: plantError } = await supabase
    .from('plants')
    .select('*')
    .eq('qr_slug', slug)
    .single()

  if (plantError || !plant) {
    notFound()
  }

  const { data: latestLog } = await supabase
    .from('plant_maintenance_logs')
    .select('*')
    .eq('plant_id', plant.id)
    .order('performed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const mood = plant.is_dead
    ? '💀'
    : plant.is_dying
    ? '😟'
    : plant.needs_replacement
    ? '😕'
    : '😊'

  return (
    <main className="min-h-screen bg-[#f7f6f2] p-6 text-[#28251d]">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-sm">
        <div className="text-6xl">{mood}</div>

        <h1 className="mt-4 text-3xl font-bold">
          {plant.nickname || plant.plant_code || 'Plant'}
        </h1>

        {plant.species && (
          <p className="mt-2 text-lg text-gray-600">
            Soort: {plant.species}
          </p>
        )}

        {plant.status && (
          <p className="mt-2 text-lg text-gray-700">
            Status: {plant.status}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {plant.needs_replacement && (
            <span className="rounded bg-yellow-100 px-3 py-1">
              Vervanging nodig
            </span>
          )}
          {plant.is_dying && (
            <span className="rounded bg-orange-100 px-3 py-1">
              Plant is stervend
            </span>
          )}
          {plant.is_dead && (
            <span className="rounded bg-red-100 px-3 py-1">
              Plant is dood
            </span>
          )}
        </div>

        {latestLog ? (
          <div className="mt-8 rounded-2xl border p-4">
            <h2 className="text-xl font-semibold">Laatste onderhoud</h2>
            <p className="mt-2 text-gray-700">
              {new Date(latestLog.performed_at).toLocaleString()}
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {latestLog.watered && <span className="rounded bg-blue-100 px-2 py-1">Water</span>}
              {latestLog.pruned && <span className="rounded bg-green-100 px-2 py-1">Gesnoeid</span>}
              {latestLog.dusted && <span className="rounded bg-gray-100 px-2 py-1">Stofvrij</span>}
              {latestLog.rotated && <span className="rounded bg-purple-100 px-2 py-1">Gedraaid</span>}
              {latestLog.fed && <span className="rounded bg-lime-100 px-2 py-1">Voeding</span>}
              {latestLog.pest_treated && <span className="rounded bg-amber-100 px-2 py-1">Plagen</span>}
              {latestLog.repotted && <span className="rounded bg-emerald-100 px-2 py-1">Verpot</span>}
              {latestLog.soil_refreshed && <span className="rounded bg-stone-100 px-2 py-1">Verse aarde</span>}
              {latestLog.polished && <span className="rounded bg-cyan-100 px-2 py-1">Opgeblonken</span>}
            </div>

            {latestLog.notes && (
              <p className="mt-3 text-sm text-gray-700">{latestLog.notes}</p>
            )}
          </div>
        ) : (
          <p className="mt-8 text-gray-600">Nog geen onderhoud geregistreerd.</p>
        )}
      </div>
    </main>
  )
}
