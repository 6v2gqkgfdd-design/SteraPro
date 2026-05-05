import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getMood,
  statusLabel,
  statusColor,
  type PlantOverviewPlant,
} from '@/components/plant-overview'

export default async function RoomDetailPage({
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

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select(
      `
      *,
      locations (
        id,
        name,
        company_id,
        companies (
          id,
          name
        )
      )
      `
    )
    .eq('id', id)
    .maybeSingle()

  if (roomError || !room) {
    notFound()
  }

  const locationData = room.locations as
    | {
        id: string
        name: string | null
        company_id: string | null
        companies: { id: string; name: string | null } | null
      }
    | null
  const company = locationData?.companies ?? null

  const { data: plants } = await supabase
    .from('plants')
    .select('*')
    .eq('room_id', id)
    .order('created_at', { ascending: false })

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/dashboard" className="stera-cta stera-cta-ghost">
          ← Dashboard
        </Link>

        <div>
          <p className="stera-eyebrow mb-2">Ruimte</p>
          <h1 className="stera-display text-3xl sm:text-4xl">{room.name}</h1>

          <div className="mt-3 space-y-1 text-sm text-stera-ink-soft">
            {company?.name && <p>Bedrijf: {company.name}</p>}
            {locationData?.name && <p>Locatie: {locationData.name}</p>}
            {room.floor && <p>Verdieping: {room.floor}</p>}
          </div>

          {room.notes && (
            <p className="mt-3 text-sm text-stera-ink-soft">{room.notes}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/rooms/${room.id}/plants/new`}
            className="stera-cta stera-cta-primary"
          >
            Nieuwe plant
          </Link>

          <Link
            href={`/rooms/${room.id}/edit`}
            className="stera-cta stera-cta-secondary"
          >
            Ruimte bewerken
          </Link>
        </div>

        <section className="space-y-3">
          <p className="stera-eyebrow">Planten</p>

          {!plants || plants.length === 0 ? (
            <div className="stera-card">
              <p className="text-sm text-stera-ink-soft">
                Nog geen planten in deze ruimte.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {plants.map((plant) => (
                <li
                  key={plant.id}
                  className="stera-card transition hover:border-stera-green"
                >
                  <Link href={`/plants/${plant.id}`} className="block">
                    <p className="font-semibold text-stera-ink">
                      {plant.nickname || plant.plant_code || 'Zonder naam'}
                    </p>

                    {plant.species && (
                      <p className="mt-1 text-sm text-stera-ink-soft">
                        {plant.species}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {(() => {
                        const overview = plant as PlantOverviewPlant
                        const mood = getMood(overview)
                        if (mood === 'healthy') return null
                        return (
                          <span
                            className={`rounded border px-2 py-1 font-medium ${statusColor(overview)}`}
                          >
                            {statusLabel(overview)}
                          </span>
                        )
                      })()}
                    </div>

                    {plant.notes && (
                      <p className="mt-2 text-sm text-stera-ink-soft">
                        {plant.notes}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
