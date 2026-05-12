import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteLocationButton from '@/components/delete-location-button'
import { RowMenu, RowMenuItem } from '@/components/row-menu'
import { formatRoomLabel } from '@/lib/rooms'

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
        .select('id, room_id, status')
        .in('room_id', roomIds)
    : { data: [] }

  // Categorieën voor de pillen + per-ruimte teller.
  //   gezond = status 'healthy'
  //   ziek   = status 'needs_attention' of 'maintenance_due'
  //   dood   = status 'dead' of 'replacement_needed'
  // Dode planten tellen niet mee in "Totaal" — die worden geacht
  // verwijderd te worden uit de werkelijke voorraad.
  function plantCategory(
    s: string | null | undefined
  ): 'gezond' | 'ziek' | 'dood' {
    if (s === 'dead' || s === 'replacement_needed') return 'dood'
    if (s === 'needs_attention' || s === 'maintenance_due') return 'ziek'
    return 'gezond'
  }

  const plantCountByRoom = new Map<string, number>()
  const deadCountByRoom = new Map<string, number>()
  let countGezond = 0
  let countZiek = 0
  let countDood = 0

  for (const plant of plantsForCount ?? []) {
    const cat = plantCategory(plant.status as string | null)
    if (cat === 'dood') {
      countDood += 1
      if (plant.room_id) {
        deadCountByRoom.set(
          plant.room_id,
          (deadCountByRoom.get(plant.room_id) ?? 0) + 1
        )
      }
      continue // dode planten niet meetellen in de "levende" tellers
    }
    if (cat === 'ziek') countZiek += 1
    else countGezond += 1
    if (plant.room_id) {
      plantCountByRoom.set(
        plant.room_id,
        (plantCountByRoom.get(plant.room_id) ?? 0) + 1
      )
    }
  }

  const totalLiving = countGezond + countZiek

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
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="space-y-1">
          <p className="text-xs text-stera-ink-soft">
            {location.companies?.id ? (
              <Link
                href={`/companies/${location.companies.id}`}
                className="hover:text-stera-green"
              >
                ← {location.companies.name || 'Klant'}
              </Link>
            ) : null}
          </p>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold text-stera-ink sm:text-3xl">
                {location.name}
              </h1>
              {fullAddress && (
                <p className="mt-1 text-sm text-stera-ink-soft">
                  {fullAddress}
                </p>
              )}
              {location.notes && (
                <p className="mt-1 text-sm text-stera-ink-soft">
                  {location.notes}
                </p>
              )}
            </div>
            <RowMenu>
              <RowMenuItem href={`/locations/${location.id}/edit`}>
                Bewerken
              </RowMenuItem>
              <RowMenuItem href={`/locations/${location.id}/qr`}>
                QR-labels
              </RowMenuItem>
              <div className="border-t border-stera-line" />
              <DeleteLocationButton
                locationId={location.id}
                companyId={location.company_id}
                variant="menu"
              />
            </RowMenu>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-stera-green px-4 py-2.5 text-sm font-semibold text-white">
            Ruimtes
            <span className="ml-2 opacity-70">{rooms?.length ?? 0}</span>
          </span>
          <Link
            href={`/locations/${location.id}/rooms/new`}
            className="stera-cta stera-cta-primary"
          >
            + Nieuwe ruimte
          </Link>
        </div>

        {/* Plant-overzicht per categorie. Dode planten worden geacht
            verwijderd te zijn, dus tellen niet mee in 'Totaal'. */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-stera-line bg-white px-3 py-1.5 font-medium">
            Totaal{' '}
            <span className="ml-1 font-semibold text-stera-ink">
              {totalLiving}
            </span>
          </span>
          <span className="rounded-full bg-stera-green/10 px-3 py-1.5 font-medium text-stera-green">
            Gezond <span className="ml-1 font-semibold">{countGezond}</span>
          </span>
          {countZiek > 0 ? (
            <span className="rounded-full bg-orange-100 px-3 py-1.5 font-medium text-orange-800">
              Ziek <span className="ml-1 font-semibold">{countZiek}</span>
            </span>
          ) : (
            <span className="rounded-full border border-stera-line bg-white px-3 py-1.5 font-medium text-stera-ink-soft">
              Ziek <span className="ml-1 font-semibold">0</span>
            </span>
          )}
          {countDood > 0 ? (
            <span className="rounded-full bg-red-100 px-3 py-1.5 font-medium text-red-800">
              Dood <span className="ml-1 font-semibold">{countDood}</span>
            </span>
          ) : null}
        </div>

        {!rooms || rooms.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stera-line p-6 text-center text-sm text-stera-ink-soft">
            Nog geen ruimtes. Maak er één voor receptie, vergaderzaal, lokaal 3.04, ...
          </div>
        ) : (
          <ul className="space-y-3">
            {(rooms as RoomRow[]).map((room) => {
              const plantCount = plantCountByRoom.get(room.id) ?? 0
              const deadCount = deadCountByRoom.get(room.id) ?? 0
              return (
                <li
                  key={room.id}
                  className="stera-card transition hover:border-stera-green"
                >
                  <Link href={`/rooms/${room.id}`} className="block">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-stera-ink">
                        {formatRoomLabel(room.name, room.floor)}
                      </p>
                      <p className="text-xs text-stera-ink-soft">
                        {plantCount} {plantCount === 1 ? 'plant' : 'planten'}
                        {deadCount > 0 ? (
                          <span className="ml-1 text-red-700">
                            · {deadCount} dood
                          </span>
                        ) : null}
                      </p>
                    </div>
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
      </div>
    </main>
  )
}
