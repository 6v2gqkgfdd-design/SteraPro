import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import MaintenanceActions from './maintenance-actions'
import VisitConsumables from './visit-consumables'

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: visit, error } = await supabase
    .from('maintenance_visits')
    .select(`
      *,
      locations (
        id,
        name
      )
    `)
    .eq('id', id)
    .single()

  const { data: visitPlants } = await supabase
    .from('maintenance_visit_plants')
    .select(`
      *,
      plants (
        id,
        nickname,
        species,
        reference_code
      )
    `)
    .eq('visit_id', id)
    .order('created_at', { ascending: true })

  if (error || !visit) {
    return (
      <main className="p-6">
        <p className="text-red-600">Onderhoudsbeurt niet gevonden.</p>
      </main>
    )
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="stera-eyebrow mb-2">Onderhoud</p>
            <h1 className="stera-display text-3xl sm:text-4xl">{visit.title}</h1>
            <p className="mt-2 text-sm text-stera-ink-soft">
              {visit.locations?.name ?? 'Onbekende locatie'} •{' '}
              {visit.scheduled_start
                ? new Date(visit.scheduled_start).toLocaleString('nl-BE')
                : 'Geen datum'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/maintenance/${id}/report`}
              className="stera-cta stera-cta-primary"
            >
              Klantrapport
            </Link>

            <Link
              href="/maintenance"
              className="stera-cta stera-cta-ghost"
            >
              Overzicht
            </Link>

            </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="stera-card">
            <p className="stera-eyebrow mb-2">Vorige keer</p>
            <p className="whitespace-pre-wrap text-sm text-stera-ink-soft">
              {visit.previous_visit_summary || 'Geen vorige samenvatting beschikbaar.'}
            </p>
          </div>

          <div className="stera-card">
            <p className="stera-eyebrow mb-2">Vandaag te doen</p>
            <p className="whitespace-pre-wrap text-sm text-stera-ink-soft">
              {visit.planned_tasks || 'Geen geplande taken ingevuld.'}
            </p>
          </div>
        </div>

        <div className="stera-card">
          <p className="stera-eyebrow mb-3">Tijdsregistratie</p>
          <MaintenanceActions visit={visit} />
        </div>

        <div className="stera-card">
          <VisitConsumables visitId={visit.id} />
        </div>

        <div className="stera-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="stera-eyebrow">Behandelde planten</p>

            <Link
              href={`/maintenance/${id}/plants`}
              className="stera-cta stera-cta-primary"
            >
              Plant toevoegen / scannen
            </Link>
          </div>

          <div className="space-y-3">
            {visitPlants?.map((item: any) => (
              <Link
                key={item.id}
                href={`/maintenance/${id}/plants/${item.plant_id}`}
                className="flex flex-wrap gap-3 rounded-lg border border-stera-line bg-stera-cream-deep p-3 transition hover:border-stera-green"
              >
                {item.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photo_url}
                    alt="Foto van plant tijdens onderhoud"
                    className="h-20 w-20 shrink-0 rounded object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.plants?.nickname || 'Plant'}
                  </p>
                  <p className="text-sm text-stera-ink-soft">
                    {item.plants?.species || 'Onbekende soort'} • {item.plants?.reference_code}
                  </p>
                  {item.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-stera-ink-soft">
                      {item.notes}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}

            {!visitPlants?.length && (
              <p className="text-sm text-stera-ink-soft">
                Nog geen planten toegevoegd aan deze onderhoudsbeurt.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
