import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function MaintenancePlantsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: visit, error } = await supabase
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

  if (error || !visit) {
    return (
      <main className="p-6">
        <p className="text-red-600">Onderhoudsbeurt niet gevonden.</p>
      </main>
    )
  }

  const { count } = await supabase
    .from('plants')
    .select('*', { count: 'exact', head: true })
    .eq('location_id', visit.location_id)

  return (
    <main className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Planten in onderhoud</h1>
            <p className="text-sm text-gray-600">
              Onderhoud: {visit.title}
            </p>
            <p className="text-sm text-gray-600">
              Locatie: {visit.locations?.name ?? 'Onbekende locatie'}
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href={`/maintenance/${id}`}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Onderhoudsoverzicht
            </Link>

            <Link
              href="/dashboard"
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
          <p>
            Op deze locatie staan momenteel <span className="font-semibold">{count ?? 0}</span> geregistreerde planten.
          </p>
          <p className="mt-1">
            Kies hieronder hoe je een plant aan dit onderhoud wilt koppelen.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href={`/maintenance/${id}/plants/new`}
            className="rounded-xl border p-5 transition hover:bg-gray-50"
          >
            <p className="text-lg font-semibold">Nieuwe plant toevoegen</p>
            <p className="mt-2 text-sm text-gray-600">
              Maak een volledig nieuwe plant aan op deze locatie, net zoals bij bedrijven en locaties.
            </p>
          </Link>

          <Link
            href={`/maintenance/${id}/plants/scan`}
            className="rounded-xl border p-5 transition hover:bg-gray-50"
          >
            <p className="text-lg font-semibold">Bestaande plant scannen</p>
            <p className="mt-2 text-sm text-gray-600">
              Scan de QR-code van een bestaande plant en registreer het onderhoud op die plant.
            </p>
          </Link>

          <Link
            href={`/maintenance/${id}/plants/select`}
            className="rounded-xl border p-5 transition hover:bg-gray-50"
          >
            <p className="text-lg font-semibold">Bestaande plant kiezen</p>
            <p className="mt-2 text-sm text-gray-600">
              Zoek en selecteer handmatig een plant die al op deze locatie geregistreerd is.
            </p>
          </Link>
        </div>
      </div>
    </main>
  )
}
