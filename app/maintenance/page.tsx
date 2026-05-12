import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatRoomLabel } from '@/lib/rooms'

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'scheduled':
      return 'bg-stera-green/10 text-stera-green border border-stera-green/30'
    case 'in_progress':
      return 'bg-amber-100 text-amber-800 border border-amber-200'
    case 'paused':
      return 'bg-purple-100 text-purple-800 border border-purple-200'
    case 'completed':
      return 'bg-stera-green text-white border border-stera-green'
    case 'cancelled':
      return 'bg-red-100 text-red-800 border border-red-200'
    default:
      return 'bg-stera-cream-deep text-stera-ink-soft border border-stera-line'
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
      companies ( name ),
      locations ( name, street, number, city ),
      maintenance_visit_rooms (
        rooms ( id, name, floor )
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
      companies ( name ),
      locations ( name, street, number, city ),
      maintenance_visit_rooms (
        rooms ( id, name, floor )
      )
    `)
    .in('status', ['completed', 'cancelled'])
    .order('scheduled_start', { ascending: false })

  const visits = activeTab === 'completed' ? completedVisits : plannedVisits
  const error = activeTab === 'completed' ? completedError : plannedError

  const plannedCount = plannedVisits?.length ?? 0
  const completedCount = completedVisits?.length ?? 0

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-6 sm:pt-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="sticky top-0 z-20 -mx-5 -mt-3 flex flex-wrap items-center justify-between gap-3 bg-stera-cream/95 px-5 pt-3 pb-3 backdrop-blur sm:static sm:mx-0 sm:mt-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/maintenance?tab=planned"
              className={
                activeTab === 'planned'
                  ? 'rounded-full bg-stera-green px-4 py-2.5 text-sm font-semibold text-white'
                  : 'rounded-full border border-stera-line bg-white px-4 py-2.5 text-sm font-medium text-stera-ink hover:border-stera-green'
              }
            >
              Gepland
              <span className="ml-2 opacity-70">{plannedCount}</span>
            </Link>

            <Link
              href="/maintenance?tab=completed"
              className={
                activeTab === 'completed'
                  ? 'rounded-full bg-stera-green px-4 py-2.5 text-sm font-semibold text-white'
                  : 'rounded-full border border-stera-line bg-white px-4 py-2.5 text-sm font-medium text-stera-ink hover:border-stera-green'
              }
            >
              Afgewerkt
              <span className="ml-2 opacity-70">{completedCount}</span>
            </Link>
          </div>

          <Link
            href="/maintenance/new"
            className="stera-cta stera-cta-primary"
          >
            + Nieuwe afspraak
          </Link>
        </div>

        {error && (
          <p className="text-red-600">
            Fout bij ophalen van onderhoudsafspraken.
          </p>
        )}

        <div className="grid gap-4">
          {visits?.map((visit: any) => {
            const company = Array.isArray(visit.companies)
              ? visit.companies[0]
              : visit.companies
            const location = Array.isArray(visit.locations)
              ? visit.locations[0]
              : visit.locations
            const locationLabel = [
              location?.name,
              [location?.street, location?.number]
                .filter(Boolean)
                .join(' ') || null,
              location?.city,
            ]
              .filter(Boolean)
              .join(' · ')

            const roomNames: string[] = (visit.maintenance_visit_rooms ?? [])
              .map((mvr: any) => {
                const r = Array.isArray(mvr.rooms) ? mvr.rooms[0] : mvr.rooms
                return r ? formatRoomLabel(r.name, r.floor) : null
              })
              .filter((n: string | null): n is string => Boolean(n))

            return (
              <Link
                key={visit.id}
                href={`/maintenance/${visit.id}`}
                className="stera-card transition hover:border-stera-green"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-stera-ink">
                      {company?.name ?? 'Onbekende klant'}
                    </p>
                    <p className="text-sm text-stera-ink-soft">
                      {locationLabel || 'Geen locatie-info'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {roomNames.map((name) => (
                        <span
                          key={name}
                          className="inline-block rounded-full bg-stera-green/10 px-3 py-1 text-xs font-medium text-stera-green"
                        >
                          {name}
                        </span>
                      ))}
                      {visit.title ? (
                        <span className="inline-block rounded-full bg-stera-cream-deep px-3 py-1 text-xs font-medium text-stera-ink">
                          {visit.title}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right text-sm">
                    <p className="text-stera-ink-soft">
                      {visit.scheduled_start
                        ? new Date(visit.scheduled_start).toLocaleString(
                            'nl-BE',
                            {
                              timeZone: 'Europe/Brussels',
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }
                          )
                        : 'Geen datum'}
                    </p>
                    <span
                      className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                        visit.status
                      )}`}
                    >
                      {getStatusLabel(visit.status)}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}

          {!visits?.length && (
            <div className="stera-empty space-y-3">
              <p className="stera-empty-title">
                {activeTab === 'planned'
                  ? 'Geen geplande afspraken'
                  : 'Nog niets afgewerkt'}
              </p>
              <p className="text-sm">
                {activeTab === 'planned'
                  ? 'Plan een nieuwe onderhoudsbeurt bij een klant.'
                  : 'Zodra een afspraak afgewerkt is, verschijnt ze hier.'}
              </p>
              {activeTab === 'planned' ? (
                <div>
                  <Link
                    href="/maintenance/new"
                    className="stera-cta stera-cta-primary"
                  >
                    + Nieuwe afspraak
                  </Link>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
