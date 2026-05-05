import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteLocationButton from '@/components/delete-location-button'
import {
  getMood,
  statusLabel,
  statusColor,
  type PlantOverviewPlant,
} from '@/components/plant-overview'

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

  const { data: plants, error: plantsError } = await supabase
    .from('plants')
    .select('*')
    .eq('location_id', id)
    .order('created_at', { ascending: false })

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
          <div className="mt-3 space-y-1 text-sm text-stera-ink-soft">
            {location.floor && <p>Verdieping: {location.floor}</p>}
            {location.room && <p>Ruimte: {location.room}</p>}
          </div>
          {location.notes && (
            <p className="mt-3 text-sm text-stera-ink-soft">{location.notes}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/locations/${location.id}/plants/new`}
            className="stera-cta stera-cta-primary"
          >
            Nieuwe plant
          </Link>

          <Link
            href={`/locations/${location.id}/qr`}
            className="stera-cta stera-cta-secondary"
          >
            QR-labels
          </Link>

          <DeleteLocationButton
            locationId={location.id}
            companyId={location.company_id}
          />
        </div>

        <section className="space-y-3">
          <p className="stera-eyebrow">Planten</p>

          {plantsError ? (
            <p className="text-red-600">
              Fout bij ophalen planten: {plantsError.message}
            </p>
          ) : !plants || plants.length === 0 ? (
            <div className="stera-card">
              <p className="text-sm text-stera-ink-soft">Nog geen planten toegevoegd.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {plants.map((plant) => (
                <li key={plant.id} className="stera-card transition hover:border-stera-blue">
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
