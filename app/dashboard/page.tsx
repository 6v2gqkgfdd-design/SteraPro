import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SteraLogo from '@/components/stera-logo'
import WeatherPill from '@/components/weather-pill'
import { getTodaysWeather } from '@/lib/weather'

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
    { data: flaggedVisitPlants },
    { data: openReports },
    weather,
  ] = await Promise.all([
    // Vandaag — alleen open beurten (geen voltooide/geannuleerde)
    supabase
      .from('maintenance_visits')
      .select(
        `id, title, status, scheduled_start, location_id,
         locations ( name, street, number, postal_code, city, companies ( name ) )`
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

    // Openstaande klantmeldingen
    supabase
      .from('plant_reports')
      .select(
        `id, plant_id, issue_type, message, reporter_name, status, created_at,
         plants ( id, nickname, species, reference_code )`
      )
      .in('status', ['new', 'seen'])
      .order('created_at', { ascending: false })
      .limit(10),

    // Weersverwachting (faalveilig — null als API down is)
    getTodaysWeather(),
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

  function locationAddress(visit: any): string | null {
    const loc = visit.locations as any
    const l = Array.isArray(loc) ? loc[0] : loc
    if (!l) return null
    const streetLine = [l.street, l.number].filter(Boolean).join(' ').trim()
    const cityLine = [l.postal_code, l.city].filter(Boolean).join(' ').trim()
    const parts = [streetLine, cityLine].filter(Boolean)
    if (parts.length === 0) return null
    return parts.join(', ')
  }

  /**
   * Bouw een Google Maps directions-URL met alle adressen van vandaag
   * als waypoints. Op iPhone/Android opent dit de Maps-app als die
   * geïnstalleerd is, anders de webversie.
   */
  function buildRouteUrl(visits: any[]): string | null {
    const stops = visits
      .map(locationAddress)
      .filter((a): a is string => Boolean(a && a.trim()))
    if (stops.length === 0) return null

    if (stops.length === 1) {
      const url = new URL('https://www.google.com/maps/dir/')
      url.searchParams.set('api', '1')
      url.searchParams.set('destination', stops[0])
      url.searchParams.set('travelmode', 'driving')
      return url.toString()
    }

    const destination = stops[stops.length - 1]
    const waypoints = stops.slice(0, -1).join('|')
    const url = new URL('https://www.google.com/maps/dir/')
    url.searchParams.set('api', '1')
    url.searchParams.set('destination', destination)
    url.searchParams.set('waypoints', waypoints)
    url.searchParams.set('travelmode', 'driving')
    return url.toString()
  }

  const routeUrl = buildRouteUrl(todaysVisits ?? [])
  const skippedAddressCount =
    (todaysVisits ?? []).length -
    (todaysVisits ?? []).filter((v) => locationAddress(v)).length

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
  const reportCount = openReports?.length ?? 0

  const summaryLine = (() => {
    const parts: string[] = []
    if (todaysCount === 0) parts.push('Geen afspraken vandaag')
    else if (todaysCount === 1) parts.push('1 afspraak vandaag')
    else parts.push(`${todaysCount} afspraken vandaag`)

    if (flaggedCount === 1) parts.push('1 plant heeft aandacht nodig')
    else if (flaggedCount > 1) parts.push(`${flaggedCount} planten hebben aandacht nodig`)

    if (reportCount === 1) parts.push('1 nieuwe klantmelding')
    else if (reportCount > 1) parts.push(`${reportCount} nieuwe klantmeldingen`)

    return parts.join(' · ')
  })()

  const REPORT_LABELS: Record<string, string> = {
    replace: 'Plant moet vervangen worden',
    sick: 'Plant lijkt ziek',
    damaged: 'Plant is beschadigd',
    pest: 'Ongedierte / aantasting',
    other: 'Andere opmerking',
  }

  return (
    <main className="bg-stera-cream px-5 pt-3 pb-4 sm:px-8 sm:pt-10 sm:pb-10">
      <div className="mx-auto max-w-4xl space-y-3 sm:space-y-6">
        {/* Hero — compact, met logo */}
        <div className="flex items-center justify-between gap-3">
          <SteraLogo variant="compact" href={null} />
          {weather ? <WeatherPill weather={weather} /> : null}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-stera-ink">
            {greeting}, Jelle
          </p>
          <p className="text-xs text-stera-ink-soft">{todayLabel}</p>
        </div>

        {/* KPI-tegels */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Link
            href="/maintenance?tab=planned"
            className="rounded-xl border border-stera-line bg-white p-2.5 transition hover:border-stera-green"
          >
            <p className="text-[10px] uppercase tracking-wider text-stera-ink-soft">
              Vandaag
            </p>
            <p className="text-xl font-semibold text-stera-ink">
              {todaysCount}
            </p>
          </Link>
          <Link
            href="/maintenance?tab=planned"
            className={`rounded-xl border p-2.5 transition ${
              flaggedCount > 0
                ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
                : 'border-stera-line bg-white hover:border-stera-green'
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-stera-ink-soft">
              Aandacht
            </p>
            <p
              className={`text-xl font-semibold ${
                flaggedCount > 0 ? 'text-amber-800' : 'text-stera-ink'
              }`}
            >
              {flaggedCount}
            </p>
          </Link>
          <div
            className={`rounded-xl border p-2.5 ${
              reportCount > 0
                ? 'border-amber-200 bg-amber-50'
                : 'border-stera-line bg-white'
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-stera-ink-soft">
              Meldingen
            </p>
            <p
              className={`text-xl font-semibold ${
                reportCount > 0 ? 'text-amber-800' : 'text-stera-ink'
              }`}
            >
              {reportCount}
            </p>
          </div>
        </div>

        {/* Snelle acties */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Link
            href="/scan"
            className="flex items-center gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
          >
            <span className="text-xl">📷</span>
            <span className="text-sm font-medium text-stera-ink">
              Scan plant
            </span>
          </Link>
          <Link
            href="/maintenance/new"
            className="flex items-center gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
          >
            <span className="text-xl">➕</span>
            <span className="text-sm font-medium text-stera-ink">
              Nieuwe afspraak
            </span>
          </Link>
        </div>

        {/* Vandaag — compact, max 2 zichtbaar zodat alles in 1 scherm past */}
        <section className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
              Vandaag
            </p>
            {routeUrl ? (
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-stera-green underline-offset-4 hover:underline"
              >
                Route in Maps →
              </a>
            ) : null}
          </div>

          {todaysVisits && todaysVisits.length > 0 ? (
            <ul className="space-y-2">
              {todaysVisits.slice(0, 2).map((visit: any) => (
                <li key={visit.id}>
                  <Link
                    href={`/maintenance/${visit.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stera-ink">
                        {locationLine(visit)}
                      </p>
                      <p className="truncate text-xs text-stera-ink-soft">
                        {visit.title}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-stera-green">
                      {formatTime(visit.scheduled_start)}
                    </span>
                  </Link>
                </li>
              ))}
              {todaysVisits.length > 2 ? (
                <li>
                  <Link
                    href="/maintenance?tab=planned"
                    className="block rounded-xl border border-dashed border-stera-line bg-white p-2 text-center text-xs text-stera-ink-soft hover:border-stera-green hover:text-stera-green"
                  >
                    +{todaysVisits.length - 2} meer afspraken vandaag →
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-stera-line p-3 text-center text-xs text-stera-ink-soft">
              Geen afspraken vandaag.
            </div>
          )}
        </section>

        {/* Komende week — compact */}
        {upcomingVisits && upcomingVisits.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
                Komende week
              </p>
              <Link
                href="/maintenance"
                className="text-xs font-medium text-stera-green underline-offset-4 hover:underline"
              >
                Alle afspraken →
              </Link>
            </div>
            <ul className="space-y-2">
              {upcomingVisits.map((visit: any) => (
                <li key={visit.id}>
                  <Link
                    href={`/maintenance/${visit.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stera-ink">
                        {locationLine(visit)}
                      </p>
                      <p className="truncate text-xs text-stera-ink-soft">
                        {visit.title}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <span className="block font-medium text-stera-ink">
                        {formatDay(visit.scheduled_start)}
                      </span>
                      <span className="text-stera-ink-soft">
                        {formatTime(visit.scheduled_start)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  )
}
