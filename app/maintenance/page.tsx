import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-100 text-blue-800 border border-blue-200'
    case 'in_progress':
      return 'bg-amber-100 text-amber-800 border border-amber-200'
    case 'paused':
      return 'bg-purple-100 text-purple-800 border border-purple-200'
    case 'completed':
      return 'bg-green-100 text-green-800 border border-green-200'
    case 'cancelled':
      return 'bg-red-100 text-red-800 border border-red-200'
    default:
      return 'bg-gray-100 text-gray-800 border border-gray-200'
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'scheduled':
      return 'Gepland'
    case 'in_progress':
      return 'In uitvoering'
    case 'paused':
      return 'Gepauzeerd'
    case 'completed':
      return 'Voltooid'
    case 'cancelled':
      return 'Geannuleerd'
    default:
      return status
  }
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const activeTab = params?.tab === 'completed' ? 'completed' : 'planned'

  const supabase = await createClient()

  const { data: plannedVisits, error: plannedError } = await supabase
    .from('maintenance_visits')
    .select(`
      id,
      title,
      status,
      scheduled_start,
      locations (
        name
      )
    `)
    .in('status', ['scheduled', 'in_progress', 'paused'])
    .order('scheduled_start', { ascending: true })

  const { data: completedVisits, error: completedError } = await supabase
    .from('maintenance_visits')
    .select(`
      id,
      title,
      status,
      scheduled_start,
      ended_at,
      locations (
        name
      )
    `)
    .eq('status', 'completed')
    .order('scheduled_start', { ascending: false })

  const visits = activeTab === 'completed' ? completedVisits : plannedVisits
  const error = activeTab === 'completed' ? completedError : plannedError

  return (
    <main className="p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Onderhoud</h1>
            <p className="text-sm text-gray-600">
              Beheer geplande en afgewerkte onderhoudsbeurten.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border px-4 py-2"
            >
              Dashboard
            </Link>

            <Link
              href="/maintenance/new"
              className="rounded-lg bg-black px-4 py-2 text-white"
            >
              Nieuwe afspraak
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/maintenance?tab=planned"
            className={
              activeTab === 'planned'
                ? 'rounded-lg bg-black px-4 py-2 text-sm text-white'
                : 'rounded-lg border px-4 py-2 text-sm'
            }
          >
            Gepland
          </Link>

          <Link
            href="/maintenance?tab=completed"
            className={
              activeTab === 'completed'
                ? 'rounded-lg bg-black px-4 py-2 text-sm text-white'
                : 'rounded-lg border px-4 py-2 text-sm'
            }
          >
            Voltooid
          </Link>
        </div>

        {error && (
          <p className="text-red-600">
            Fout bij ophalen van onderhoudsafspraken.
          </p>
        )}

        <div className="grid gap-4">
          {visits?.map((visit: any) => (
            <Link
              key={visit.id}
              href={`/maintenance/${visit.id}`}
              className="rounded-xl border p-4 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">{visit.title}</p>
                  <p className="text-sm text-gray-600">
                    {visit.locations?.name ?? 'Onbekende locatie'}
                  </p>
                </div>

                <div className="text-right text-sm">
                  <p>
                    {visit.scheduled_start
                      ? new Date(visit.scheduled_start).toLocaleString()
                      : 'Geen datum'}
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
                      visit.status
                    )}`}
                  >
                    {getStatusLabel(visit.status)}
                  </span>
                </div>
              </div>
            </Link>
          ))}

          {!visits?.length && (
            <div className="rounded-xl border border-dashed p-6 text-sm text-gray-600">
              {activeTab === 'planned'
                ? 'Nog geen geplande onderhoudsafspraken gevonden.'
                : 'Nog geen voltooide onderhoudsbeurten gevonden.'}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
