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
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="space-y-1">
          <p className="text-xs text-stera-ink-soft">
            {company?.name ? (
              <Link
                href={`/companies/${locationData?.company_id}`}
                className="hover:text-stera-green"
              >
                {company.name}
              </Link>
            ) : null}
            {company?.name && locationData?.name ? ' · ' : ''}
            {locationData?.name ? (
              <Link
                href={`/locations/${locationData.id}`}
                className="hover:text-stera-green"
              >
                {locationData.name}
              </Link>
            ) : null}
          </p>
          <h1 className="text-2xl font-semibold text-stera-ink sm:text-3xl">
            {room.name}
          </h1>
          {room.notes && (
            <p className="text-sm text-stera-ink-soft">{room.notes}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-stera-green px-4 py-1.5 text-sm font-semibold text-white">
            Planten
            <span className="ml-2 opacity-70">{plants?.length ?? 0}</span>
          </span>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rooms/${room.id}/edit`}
              className="rounded-full border border-stera-line bg-white px-4 py-1.5 text-sm font-medium text-stera-ink hover:border-stera-green"
            >
              Ruimte bewerken
            </Link>
            <Link
              href={`/rooms/${room.id}/plants/new`}
              className="stera-cta stera-cta-primary"
            >
              + Nieuwe plant
            </Link>
          </div>
        </div>

        {!plants || plants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stera-line p-6 text-center text-sm text-stera-ink-soft">
            Nog geen planten in deze ruimte.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {plants.map((plant) => {
              const overview = plant as PlantOverviewPlant
              const mood = getMood(overview)
              const photo = (plant as any).photo_url as string | null
              return (
                <li key={plant.id}>
                  <Link
                    href={`/plants/${plant.id}`}
                    className="stera-card flex gap-3 transition hover:border-stera-green"
                  >
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt={plant.nickname || plant.species || 'plant'}
                        className="h-20 w-20 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-stera-cream-deep text-2xl">
                        🌿
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-stera-ink">
                        {plant.nickname || plant.plant_code || 'Zonder naam'}
                      </p>
                      {plant.species && (
                        <p className="mt-0.5 truncate text-sm text-stera-ink-soft">
                          {plant.species}
                        </p>
                      )}
                      {mood !== 'healthy' && (
                        <span
                          className={`mt-2 inline-block rounded border px-2 py-0.5 text-xs font-medium ${statusColor(overview)}`}
                        >
                          {statusLabel(overview)}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
