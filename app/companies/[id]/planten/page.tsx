/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Breadcrumbs } from '@/components/breadcrumbs'
import PlantThumb from '@/components/plant-thumb'
import {
  plantStatusClass,
  plantStatusLabel,
} from '@/lib/company-labels'
import { formatRoomLabel } from '@/lib/rooms'

export default async function CompanyPlantsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()
  if (!company) notFound()

  const base = `/companies/${company.id}`
  const from = encodeURIComponent(`${base}/planten`)

  const { data: plants, error } = await supabase
    .from('plants')
    .select(
      `id, nickname, species, reference_code, status, photo_url, is_artificial,
       locations ( name ),
       rooms ( name, floor )`
    )
    .eq('company_id', id)
    .order('nickname', { ascending: true })

  const list = plants ?? []

  // Groepeer licht op status voor overzicht
  const counts: Record<string, number> = {}
  for (const p of list) {
    const s = (p as any).status || 'onbekend'
    counts[s] = (counts[s] || 0) + 1
  }

  return (
    <main className="stera-page-pb bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <Breadcrumbs
          items={[
            { label: 'Klanten', href: '/companies' },
            { label: company.name, href: base },
            { label: 'Planten' },
          ]}
        />

        <div>
          <h1 className="font-serif text-3xl text-stera-green">Planten</h1>
          <p className="mt-1 text-sm text-stera-ink-soft">
            {list.length} plant{list.length === 1 ? '' : 'en'} bij {company.name}
            {Object.keys(counts).length > 0 ? (
              <span>
                {' '}
                ·{' '}
                {Object.entries(counts)
                  .map(([s, n]) => `${n}× ${plantStatusLabel(s).toLowerCase()}`)
                  .join(', ')}
              </span>
            ) : null}
          </p>
        </div>

        {error ? (
          <p className="text-red-600">{error.message}</p>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stera-line p-6 text-center text-sm text-stera-ink-soft">
            Nog geen planten voor deze klant.
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((plant: any) => {
              const loc = Array.isArray(plant.locations)
                ? plant.locations[0]
                : plant.locations
              const room = Array.isArray(plant.rooms)
                ? plant.rooms[0]
                : plant.rooms
              const place = [
                loc?.name,
                room
                  ? formatRoomLabel(room.name, room.floor)
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')
              const name =
                plant.nickname || plant.species || plant.reference_code || 'Plant'

              return (
                <li key={plant.id}>
                  <Link
                    href={`/plants/${plant.id}?from=${from}`}
                    className="flex items-center gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
                  >
                    {plant.photo_url ? (
                      <PlantThumb src={plant.photo_url} alt={name} size={56} />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-stera-cream-deep text-lg">
                        {plant.is_artificial ? '🪴' : '🌿'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stera-ink">
                        {name}
                      </p>
                      {plant.species && plant.nickname ? (
                        <p className="truncate text-xs text-stera-ink-soft">
                          {plant.species}
                        </p>
                      ) : null}
                      {place ? (
                        <p className="truncate text-xs text-stera-ink-soft">
                          {place}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${plantStatusClass(plant.status)}`}
                    >
                      {plantStatusLabel(plant.status)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <Link
          href={base}
          className="inline-block text-sm font-medium text-stera-green underline-offset-4 hover:underline"
        >
          ← Terug naar {company.name}
        </Link>
      </div>
    </main>
  )
}
