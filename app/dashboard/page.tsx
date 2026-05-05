import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SteraLogo from '@/components/stera-logo'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const now = new Date()

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const sevenDaysLater = new Date(startOfToday)
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 8)

  const startOfTodayIso = startOfToday.toISOString()
  const startOfTomorrowIso = startOfTomorrow.toISOString()
  const sevenDaysLaterIso = sevenDaysLater.toISOString()

  const [
    { data: todaysVisits },
    { data: upcomingVisits },
    { data: recentVisits },
    { data: flaggedVisitPlants },
  ] = await Promise.all([
    // Vandaag — alleen open beurten (geen voltooide/geannuleerde)
    supabase
      .from('maintenance_visits')
      .select(
        `id, title, status, scheduled_start, location_id,
         locations ( name, companies ( name ) )`
      )
      .gte('scheduled_start', startOfTodayIso)
      .lt('scheduled_start', startOfTomorrowIso)
      .in('status', ['scheduled', 'in_progress', 'paused'])
      .order('scheduled_start', { ascending: true }),

    // Komende 7 dagen (na vandaag)
    supabase
      .from('maintenance_visits')
      .select(
        `id, title, status, scheduled_start, location_id,
         locations ( name, companies ( name ) )`
      )
      .gte('scheduled_start', startOfTomorrowIso)
      .lt('scheduled_start', sevenDaysLaterIso)
      .in('status', ['scheduled', 'in_progress', 'paused'])
      .order('scheduled_start', { ascending: true })
      .limit(5),

    // Recent voltooid
    supabase
      .from('maintenance_visits')
      .select(
        `id, title, ended_at, location_id,
         locations ( name, companies ( name ) )`
      )
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(3),

    // Planten met aandacht nodig
    supabase
      .from('maintenance_visit_plants')
      .select(
        `id, plant_id, scanned_at, health_status, notes,
         plants ( id, nickname, species, reference_code )`
      )
      .in('health_status', ['needs-attention', 'dying'])
      .order('scanned_at', { ascending: false })
      .limit(20),
  ])

  // Dedupe op plant_id: alleen de laatst geziene status telt
  const seenPlantIds = new Set<string>()
  const flaggedPlants: any[] = []
  for (const row of flaggedVisitPlants ?? []) {
    if (!row.plant_id || seenPlantIds.has(row.plant_id)) continue
    seenPlantIds.add(row.plant_id)
    flaggedPlants.push(row)
    if (flaggedPlants.length >= 5) break
  }

  function formatDay(date: string | null) {
    if (!date) return ''
    return new Date(date).toLocaleDateString('nl-BE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  function formatTime(date: string | null) {
    if (!date) return ''
    return new Date(date).toLocaleTimeString('nl-BE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function locationLine(visit: any) {
    const loc = visit.locations as any
    const locName = Array.isArray(loc) ? loc[0]?.name : loc?.name
    const company = Array.isArray(loc) ? loc[0]?.companies : loc?.companies
    const companyName = Array.isArray(company) ? company[0]?.name : company?.name
    return [companyName, locName].filter(Boolean).join(' · ') || 'Onbekende locatie'
  }

  const greeting = (() => {
    const hour = now.getHours()
    if (hour < 6) return 'Goeienacht'
    if (hour < 12) return 'Goeiemorgen'
    if (hour < 18) return 'Goeiemiddag'
    return 'Goeieavond'
  })()

  const todayLabel = now.toLocaleDateString('nl-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const todaysCount = todaysVisits?.length ?? 0
  const flaggedCount = flaggedPlants.length

  const summaryLine = (() => {
    const parts: string[] = []
    if (todaysCount === 0) parts.push('Geen afspraken vandaag')
    else if (todaysCount === 1) parts.push('1 afspraak vandaag')
    else parts.push(`${todaysCount} afspraken vandaag`)

    if (flaggedCount === 1) parts.push('1 plant heeft aandacht nodig')
    else if (flaggedCount > 1) parts.push(`${flaggedCount} planten hebben aandacht nodig`)
    return parts.join(' · ')
  })()

  return (
    <main className="bg-stera-cream px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <p className="stera-eyebrow mb-3">Home</p>
          <SteraLogo variant="hero" href={null} />
          <p className="mt-4 text-base text-stera-ink">
            {greeting}. Vandaag is het {todayLabel}.
          </p>
          <p className="mt-1 text-sm text-stera-ink-soft">{summaryLine}</p>
        </div>

        {/* Vandaag */}
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <p className="stera-eyebrow">Vandaag</p>
            <Link
              href="/maintenance/new"
              className="text-sm text-stera-green underline-offset-4 hover:underline"
            >
              Afspraak inplannen →
            </Link>
          </div>

          {todaysVisits && todaysVisits.length > 0 ? (
            <ul className="space-y-3">
              {todaysVisits.map((visit: any) => (
                <li key={visit.id}>
                  <Link
                    href={`/maintenance/${visit.id}`}
                    className="stera-card block transition hover:border-stera-green"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stera-ink">{visit.title}</p>
                        <p className="mt-1 text-sm text-stera-ink-soft">
                          {locationLine(visit)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium text-stera-green">
                        {formatTime(visit.scheduled_start)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="stera-card text-sm text-stera-ink-soft">
              Geen afspraken vandaag. Geniet ervan, of plan er een in.
            </div>
          )}
        </section>

        {/* Komende week */}
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <p className="stera-eyebrow">Komende week</p>
            <Link
              href="/maintenance"
              className="text-sm text-stera-green underline-offset-4 hover:underline"
            >
              Alle afspraken →
            </Link>
          </div>

          {upcomingVisits && upcomingVisits.length > 0 ? (
            <ul className="space-y-3">
              {upcomingVisits.map((visit: any) => (
                <li key={visit.id}>
                  <Link
                    href={`/maintenance/${visit.id}`}
                    className="stera-card block transition hover:border-stera-green"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stera-ink">{visit.title}</p>
                        <p className="mt-1 text-sm text-stera-ink-soft">
                          {locationLine(visit)}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-sm text-stera-ink-soft">
                        <span className="block font-medium text-stera-ink">
                          {formatDay(visit.scheduled_start)}
                        </span>
                        {formatTime(visit.scheduled_start)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="stera-card text-sm text-stera-ink-soft">
              Niets gepland deze week.
            </div>
          )}
        </section>

        {/* Aandacht nodig */}
        <section className="space-y-3">
          <p className="stera-eyebrow">Aandacht nodig</p>

          {flaggedPlants.length > 0 ? (
            <ul className="space-y-3">
              {flaggedPlants.map((row: any) => {
                const plant = Array.isArray(row.plants) ? row.plants[0] : row.plants
                const isDying = row.health_status === 'dying'
                return (
                  <li key={row.id}>
                    <Link
                      href={`/plants/${row.plant_id}`}
                      className="stera-card block transition hover:border-stera-green"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-stera-ink">
                            {plant?.nickname || plant?.species || 'Plant'}
                          </p>
                          <p className="mt-1 text-sm text-stera-ink-soft">
                            {[plant?.species, plant?.reference_code]
                              .filter(Boolean)
                              .join(' · ') || 'Geen extra info'}
                          </p>
                          {row.notes ? (
                            <p className="mt-2 line-clamp-2 text-sm text-stera-ink-soft">
                              {row.notes}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                            isDying
                              ? 'bg-red-50 text-red-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {isDying ? 'Stervend' : 'Aandacht'}
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="stera-card text-sm text-stera-ink-soft">
              Alle planten zijn op dit moment in goede gezondheid.
            </div>
          )}
        </section>

        {/* Recent voltooid */}
        <section className="space-y-3">
          <p className="stera-eyebrow">Recent voltooid</p>

          {recentVisits && recentVisits.length > 0 ? (
            <ul className="space-y-3">
              {recentVisits.map((visit: any) => (
                <li key={visit.id}>
                  <Link
                    href={`/maintenance/${visit.id}/report`}
                    className="stera-card block transition hover:border-stera-green"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stera-ink">{visit.title}</p>
                        <p className="mt-1 text-sm text-stera-ink-soft">
                          {locationLine(visit)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm text-stera-ink-soft">
                        {formatDay(visit.ended_at)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="stera-card text-sm text-stera-ink-soft">
              Nog geen onderhoudsbeurten afgerond.
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
