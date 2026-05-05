import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteLocationButton from '@/components/delete-location-button'

type RoomRow = {
  id: string
  name: string | null
  floor: string | null
  notes: string | null
}

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

  // Fetch all rooms with plant counts in two queries (no joinable count yet).
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, floor, notes, created_at')
    .eq('location_id', id)
    .order('created_at', { ascending: true })

  const roomIds = (rooms ?? []).map((r) => r.id)
  const { data: plantsForCount } = roomIds.length
    ? await supabase
        .from('plants')
        .select('id, room_id')
        .in('room_id', roomIds)
    : { data: [] }

  const plantCountByRoom = new Map<string, number>()
  for (const plant of plantsForCount ?? []) {
    if (!plant.room_id) continue
    plantCountByRoom.set(
      plant.room_id,
      (plantCountByRoom.get(plant.room_id) ?? 0) + 1
    )
  }

  const fullAddress = [
    [location.street, location.number].filter(Boolean).join(' '),
    [location.postal_code, location.city].filter(Boolean).join(' '),
    location.country && location.country !== 'BE'
      ? location.country
      : undefined,
  ]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join(', ')

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href={`/companies/${location.company_id}`}
          className="text-sm text-stera-blue underline"
        >
          ← Terug naar bedrijf
        </Link>

        <div>
          <p className="stera-eyebrow mb-2">Locatie</p>
          <h1 className="stera-display text-3xl sm:text-4xl">{location.name}</h1>

          {fullAddress && (
            <p className="mt-3 text-sm text-stera-ink-soft">{fullAddress}</p>
          )}

          {location.notes && (
            <p className="mt-3 text-sm text-stera-ink-soft">{location.notes}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/locations/${location.id}/rooms/new`}
            className="stera-cta stera-cta-primary"
          >
            Nieuwe ruimte
          </Link>

          <Link
            href={`/locations/${location.id}/edit`}
            className="stera-cta stera-cta-secondary"
          >
            Locatie bewerken
          </Link>

          <Link
            href={`/locations/${location.id}/qr`}
            className="stera-cta stera-cta-ghost"
          >
            QR-labels
          </Link>

          <DeleteLocationButton
            locationId={location.id}
            companyId={location.company_id}
          />
        </div>

        <section className="space-y-3">
          <p className="stera-eyebrow">Ruimtes</p>

          {!rooms || rooms.length === 0 ? (
            <div className="stera-card">
              <p className="text-sm text-stera-ink-soft">
                Nog geen ruimtes aangemaakt. Klik op{' '}
                <span className="font-semibold">Nieuwe ruimte</span> om er een toe
                te voegen (bv. receptie, vergaderzaal, lokaal 3.04).
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {(rooms as RoomRow[]).map((room) => {
                const plantCount = plantCountByRoom.get(room.id) ?? 0
                return (
                  <li
                    key={room.id}
                    className="stera-card transition hover:border-stera-blue"
                  >
                    <Link href={`/rooms/${room.id}`} className="block">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-semibold text-stera-ink">
                          {room.name || 'Ruimte'}
                        </p>
                        <p className="text-xs text-stera-ink-soft">
                          {plantCount} {plantCount === 1 ? 'plant' : 'planten'}
                        </p>
                      </div>
                      {room.floor && (
                        <p className="mt-1 text-sm text-stera-ink-soft">
                          Verdieping: {room.floor}
                        </p>
                      )}
                      {room.notes && (
                        <p className="mt-2 text-sm text-stera-ink-soft">
                          {room.notes}
                        </p>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
