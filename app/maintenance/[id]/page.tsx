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
    <main className="p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{visit.title}</h1>
            <p className="text-sm text-gray-600">
              {visit.locations?.name ?? 'Onbekende locatie'} •{' '}
              {visit.scheduled_start
                ? new Date(visit.scheduled_start).toLocaleString()
                : 'Geen datum'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/maintenance/${id}/report`}
              className="rounded-lg bg-[#1A2F6E] px-4 py-2 text-sm text-white"
            >
              Klantrapport
            </Link>

            <Link
              href="/maintenance"
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Onderhoudsoverzicht
            </Link>

            <Link
              href="/dashboard"
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h2 className="mb-2 font-semibold">Vorige keer</h2>
            <p className="whitespace-pre-wrap text-sm text-gray-700">
              {visit.previous_visit_summary || 'Geen vorige samenvatting beschikbaar.'}
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <h2 className="mb-2 font-semibold">Vandaag te doen</h2>
            <p className="whitespace-pre-wrap text-sm text-gray-700">
              {visit.planned_tasks || 'Geen geplande taken ingevuld.'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="mb-4 font-semibold">Tijdsregistratie</h2>
          <MaintenanceActions visit={visit} />
        </div>

        <div className="rounded-xl border p-4">
          <VisitConsumables visitId={visit.id} />
        </div>

        <div className="rounded-xl border p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Behandelde planten</h2>

            <Link
              href={`/maintenance/${id}/plants`}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            >
              Plant toevoegen / scannen
            </Link>

          </div>

          <div className="space-y-3">
            {visitPlants?.map((item: any) => (
              <div key={item.id} className="rounded-lg border p-3">
                <p className="font-medium">
                  {item.plants?.nickname || 'Plant'}
                </p>
                <p className="text-sm text-gray-600">
                  {item.plants?.species || 'Onbekende soort'} • {item.plants?.reference_code}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                  {item.notes || 'Nog geen notities.'}
                </p>
              </div>
            ))}

            {!visitPlants?.length && (
              <p className="text-sm text-gray-500">
                Nog geen planten toegevoegd aan deze onderhoudsbeurt.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
