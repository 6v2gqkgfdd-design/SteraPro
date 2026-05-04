import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function MaintenancePlantsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const locationData = visit.locations as any
  const locationName = Array.isArray(locationData)
    ? (locationData[0]?.name || 'Onbekende locatie')
    : (locationData?.name || 'Onbekende locatie')

  return (
    <main className="p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Planten tijdens onderhoud</h1>
            <p className="text-sm text-gray-600">
              Onderhoud: {visit.title}
            </p>
            <p className="text-sm text-gray-600">
              Locatie: {locationName}
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href={`/maintenance/${id}`}
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

        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href={`/maintenance/${id}/plants/scan`}
            className="rounded-xl border p-5 transition hover:bg-gray-50"
          >
            <h2 className="mb-2 text-lg font-semibold">Plant scannen</h2>
            <p className="text-sm text-gray-600">
              Scan een bestaande plant via QR-code en open meteen het onderhoudsformulier.
            </p>
          </Link>

          <Link
            href={`/maintenance/${id}/plants/select`}
            className="rounded-xl border p-5 transition hover:bg-gray-50"
          >
            <h2 className="mb-2 text-lg font-semibold">Bestaande plant kiezen</h2>
            <p className="text-sm text-gray-600">
              Kies een plant uit de lijst van deze locatie en registreer het onderhoud.
            </p>
          </Link>

          <Link
            href={`/maintenance/${id}/plants/new`}
            className="rounded-xl border p-5 transition hover:bg-gray-50"
          >
            <h2 className="mb-2 text-lg font-semibold">Nieuwe plant toevoegen</h2>
            <p className="text-sm text-gray-600">
              Voeg een nieuwe plant toe aan deze locatie en registreer daarna meteen het onderhoud.
            </p>
          </Link>
        </div>
      </div>
    </main>
  )
}
