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
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="stera-eyebrow mb-2">Onderhoud · Planten</p>
            <h1 className="stera-display text-3xl sm:text-4xl">
              Plant toevoegen of scannen
            </h1>
            <p className="mt-2 text-sm text-stera-ink-soft">
              Onderhoud: {visit.title}
            </p>
            <p className="text-sm text-stera-ink-soft">
              Locatie: {locationName}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/maintenance/${id}`}
              className="stera-cta stera-cta-ghost"
            >
              Terug
            </Link>

            </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href={`/maintenance/${id}/plants/scan`}
            className="stera-card transition hover:border-stera-green"
          >
            <p className="stera-eyebrow mb-3">Optie 1</p>
            <h2 className="mb-2 text-lg font-bold text-stera-ink">Plant scannen</h2>
            <p className="text-sm text-stera-ink-soft">
              Scan een bestaande plant via QR-code en open meteen het onderhoudsformulier.
            </p>
          </Link>

          <Link
            href={`/maintenance/${id}/plants/select`}
            className="stera-card transition hover:border-stera-green"
          >
            <p className="stera-eyebrow mb-3">Optie 2</p>
            <h2 className="mb-2 text-lg font-bold text-stera-ink">Bestaande plant kiezen</h2>
            <p className="text-sm text-stera-ink-soft">
              Kies een plant uit de lijst van deze locatie en registreer het onderhoud.
            </p>
          </Link>

          <Link
            href={`/maintenance/${id}/plants/new`}
            className="stera-card transition hover:border-stera-green"
          >
            <p className="stera-eyebrow mb-3">Optie 3</p>
            <h2 className="mb-2 text-lg font-bold text-stera-ink">Nieuwe plant toevoegen</h2>
            <p className="text-sm text-stera-ink-soft">
              Voeg een nieuwe plant toe aan deze locatie en registreer daarna meteen het onderhoud.
            </p>
          </Link>
        </div>
      </div>
    </main>
  )
}
