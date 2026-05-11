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
    <main className="bg-stera-cream px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Hero — compact */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <SteraLogo variant="default" href={null} />
            {weather ? <WeatherPill weather={weather} /> : null}
          </div>
          <div>
            <p className="text-lg font-semibold text-stera-ink">
              {greeting}, Jelle.
            </p>
            <p className="text-sm text-stera-ink-soft">{todayLabel}</p>
          </div>
        </div>

        {/* KPI-tegels */}
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/maintenance?tab=planned"
            className="rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
          >
            <p className="text-xs text-stera-ink-soft">Vandaag</p>
            <p className="mt-1 text-2xl font-semibold text-stera-ink">
              {todaysCount}
            </p>
          </Link>
          <Link
            href="/maintenance?tab=planned"
            className={`rounded-xl border p-3 transition ${
              flaggedCount > 0
                ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
                : 'border-stera-line bg-white hover:border-stera-green'
            }`}
          >
            <p className="text-xs text-stera-ink-soft">Aandacht</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                flaggedCount > 0 ? 'text-amber-800' : 'text-stera-ink'
              }`}
            >
              {flaggedCount}
            </p>
          </Link>
          <div
            className={`rounded-xl border p-3 ${
              reportCount > 0
                ? 'border-amber-200 bg-amber-50'
                : 'border-stera-line bg-white'
            }`}
          >
            <p className="text-xs text-stera-ink-soft">Meldingen</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                reportCount > 0 ? 'text-amber-800' : 'text-stera-ink'
              }`}
            >
              {reportCount}
            </p>
          </div>
        </div>

        {/* Snelle acties */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/scan"
            className="flex flex-col items-center gap-2 rounded-xl border border-stera-line bg-white p-4 transition hover:border-stera-green"
          >
            <span className="text-2xl">📷</span>
            <span className="text-xs font-medium text-stera-ink">Scan plant</span>
          </Link>
          <Link
            href="/maintenance/new"
            className="flex flex-col items-center gap-2 rounded-xl border border-stera-line bg-white p-4 transition hover:border-stera-green"
          >
            <span className="text-2xl">➕</span>
            <span className="text-xs font-medium text-stera-ink">Nieuwe afspraak</span>
          </Link>
        </div>

        {summaryLine && summaryLine !== 'Geen afspraken vandaag' ? (
          <p className="text-sm text-stera-ink-soft">{summaryLine}</p>
        ) : null}

        {/* Klantmeldingen — alleen als er openstaande zijn */}
        {openReports && openReports.length > 0 ? (
          <section className="space-y-3">
            <p className="stera-eyebrow text-amber-700">Klantmeldingen</p>
            <ul className="space-y-3">
              {openReports.map((row: any) => {
                const plant = Array.isArray(row.plants)
                  ? row.plants[0]
                  : row.plants
                const plantName =
                  plant?.nickname ||
                  plant?.species ||
                  plant?.reference_code ||
                  'Plant'
                const label = REPORT_LABELS[row.issue_type] || row.issue_type
                const isNew = row.status === 'new'
                return (
                  <li key={row.id}>
                    <Link
                      href={`/plants/${row.plant_id}`}
                      className="stera-card block transition hover:border-stera-green"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-stera-ink">
                            {plantName}
                          </p>
                          <p className="mt-1 text-sm text-stera-ink-soft">
                            {label}
                            {row.reporter_name
                              ? ` · door ${row.reporter_name}`
                              : ''}
                          </p>
                          {row.message ? (
                            <p className="mt-2 line-clamp-2 text-sm text-stera-ink-soft">
                              {row.message}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                            isNew
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-stera-cream-deep text-stera-ink'
                          }`}
                        >
                          {isNew ? 'Nieuw' : 'Gezien'}
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

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

          {routeUrl ? (
            <div className="stera-card flex flex-wrap items-center justify-between gap-3 border-stera-green/40 bg-stera-cream-deep/40">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stera-ink">
                  Route van vandaag
                </p>
                <p className="text-xs text-stera-ink-soft">
                  Open de stops in volgorde van uur in Google Maps.
                  {skippedAddressCount > 0
                    ? ` ${skippedAddressCount} stop${skippedAddressCount === 1 ? '' : 's'} zonder adres niet meegenomen.`
                    : ''}
                </p>
              </div>
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="stera-cta stera-cta-primary"
              >
                Open in Maps →
              </a>
            </div>
          ) : null}

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

      </div>
    </main>
  )
}
