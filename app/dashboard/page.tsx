import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WeatherPill from '@/components/weather-pill'
import { getTodaysWeather } from '@/lib/weather'
import OpsActionBoard from '@/components/ops-action-board'
import { loadOpsSnapshot } from '@/lib/ops-overview'

type VisitRow = {
  id: string
  title: string | null
  status: string
  scheduled_start: string
  location_id: string | null
  calendar_source?: string | null
  locations: unknown
  companies?: unknown
}

type AgendaItem = {
  key: string
  href: string
  line: string
  sub: string | null
  scheduled_start: string
  badge?: string | null
}

/** Maandag 00:00 van de week waarin `d` valt (lokale server-tijd, zoals de rest van Home). */
function startOfWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay() // 0 = zo … 6 = za
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

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

  // Einde van deze kalenderweek (ma–zo): maandag + 7 dagen
  const weekStart = startOfWeekMonday(startOfToday)
  const startOfNextWeek = new Date(weekStart)
  startOfNextWeek.setDate(startOfNextWeek.getDate() + 7)

  // Eerste dag van volgende maand
  const startOfNextMonth = new Date(
    startOfToday.getFullYear(),
    startOfToday.getMonth() + 1,
    1
  )
  startOfNextMonth.setHours(0, 0, 0, 0)

  // Agenda reikt minstens tot eind maand; als de week over de maandgrens
  // loopt, tot eind van die week.
  const agendaEnd =
    startOfNextWeek > startOfNextMonth ? startOfNextWeek : startOfNextMonth

  const visitSelect = `id, title, status, scheduled_start, location_id, calendar_source,
         companies ( name ),
         locations ( name, street, number, postal_code, city, companies ( name ) )`

  const [
    { data: agendaVisits },
    { data: agendaDeliveries },
    { data: openReports },
    { data: newlySignedWorkOrders },
    weather,
    ops,
  ] = await Promise.all([
    supabase
      .from('maintenance_visits')
      .select(visitSelect)
      .gte('scheduled_start', startOfToday.toISOString())
      .lt('scheduled_start', agendaEnd.toISOString())
      .in('status', ['scheduled', 'in_progress', 'paused'])
      .order('scheduled_start', { ascending: true }),

    supabase
      .from('shopify_orders')
      .select(
        `id, name, shopify_order_number, scheduled_start, company_id,
         companies ( name ),
         locations ( name, street, number, postal_code, city )`
      )
      .gte('scheduled_start', startOfToday.toISOString())
      .lt('scheduled_start', agendaEnd.toISOString())
      .in('delivery_status', ['scheduled', 'in_progress'])
      .order('scheduled_start', { ascending: true }),

    supabase
      .from('plant_reports')
      .select(
        `id, plant_id, issue_type, message, reporter_name, status, created_at,
         plants ( id, nickname, species, reference_code )`
      )
      .in('status', ['new', 'seen'])
      .order('created_at', { ascending: false })
      .limit(10),

    supabase
      .from('work_orders')
      .select(
        `id, signed_at, signed_name,
         maintenance_visits (
           title,
           locations ( name, companies ( name ) )
         )`
      )
      .eq('status', 'signed')
      .is('acknowledged_at', null)
      .order('signed_at', { ascending: false })
      .limit(10),

    getTodaysWeather(),
    loadOpsSnapshot(supabase),
  ])

  const visits = (agendaVisits ?? []) as VisitRow[]

  function formatDay(date: string | null) {
    if (!date) return ''
    return new Date(date).toLocaleDateString('nl-BE', {
      timeZone: 'Europe/Brussels',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  function formatTime(date: string | null) {
    if (!date) return ''
    return new Date(date).toLocaleTimeString('nl-BE', {
      timeZone: 'Europe/Brussels',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function locationLine(visit: VisitRow) {
    const loc = visit.locations as any
    const locName = Array.isArray(loc) ? loc[0]?.name : loc?.name
    const companyFromLoc = Array.isArray(loc) ? loc[0]?.companies : loc?.companies
    const companyFromVisit = visit.companies as any
    const companyName =
      (Array.isArray(companyFromLoc) ? companyFromLoc[0]?.name : companyFromLoc?.name) ||
      (Array.isArray(companyFromVisit) ? companyFromVisit[0]?.name : companyFromVisit?.name)
    return (
      [companyName, locName].filter(Boolean).join(' · ') ||
      visit.title ||
      'Agenda-afspraak'
    )
  }

  function locationAddress(visit: VisitRow): string | null {
    const loc = visit.locations as any
    const l = Array.isArray(loc) ? loc[0] : loc
    if (!l) return null
    const streetLine = [l.street, l.number].filter(Boolean).join(' ').trim()
    const cityLine = [l.postal_code, l.city].filter(Boolean).join(' ').trim()
    const parts = [streetLine, cityLine].filter(Boolean)
    if (parts.length === 0) return null
    return parts.join(', ')
  }

  function visitToAgenda(visit: VisitRow): AgendaItem {
    return {
      key: `visit-${visit.id}`,
      href: `/maintenance/${visit.id}`,
      line: locationLine(visit),
      sub: visit.title,
      scheduled_start: visit.scheduled_start,
      badge: visit.calendar_source === 'iphone' ? 'iPhone' : null,
    }
  }

  function deliveryToAgenda(o: any): AgendaItem {
    const company = Array.isArray(o.companies) ? o.companies[0] : o.companies
    const loc = Array.isArray(o.locations) ? o.locations[0] : o.locations
    const line =
      [company?.name, loc?.name].filter(Boolean).join(' · ') ||
      o.name ||
      'Levering'
    return {
      key: `delivery-${o.id}`,
      href: o.company_id
        ? `/companies/${o.company_id}/bestellingen`
        : '/companies',
      line,
      sub: `Levering ${o.name || o.shopify_order_number || ''}`.trim(),
      scheduled_start: o.scheduled_start,
      badge: 'Levering',
    }
  }

  const agendaItems: AgendaItem[] = [
    ...visits.map(visitToAgenda),
    ...(agendaDeliveries ?? []).map(deliveryToAgenda),
  ].sort(
    (a, b) =>
      new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  )

  function inRange(iso: string, from: Date, to: Date) {
    const t = new Date(iso).getTime()
    return t >= from.getTime() && t < to.getTime()
  }

  const todaysItems = agendaItems.filter((i) =>
    inRange(i.scheduled_start, startOfToday, startOfTomorrow)
  )
  const thisWeekItems = agendaItems.filter((i) =>
    inRange(i.scheduled_start, startOfTomorrow, startOfNextWeek)
  )
  const restOfMonthItems = agendaItems.filter((i) =>
    inRange(i.scheduled_start, startOfNextWeek, startOfNextMonth)
  )

  /**
   * Google Maps directions-URL met alle adressen van vandaag als waypoints.
   */
  function buildRouteUrl(dayVisits: VisitRow[]): string | null {
    const stops = dayVisits
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

  const todaysVisitsOnly = visits.filter((v) =>
    inRange(v.scheduled_start, startOfToday, startOfTomorrow)
  )
  const routeUrl = buildRouteUrl(todaysVisitsOnly)

  const greeting = (() => {
    const brusselsHour = Number(
      now.toLocaleString('en-GB', {
        timeZone: 'Europe/Brussels',
        hour: '2-digit',
        hour12: false,
      })
    )
    const hour = Number.isFinite(brusselsHour) ? brusselsHour : 12
    if (hour < 6) return 'Goeienacht'
    if (hour < 12) return 'Goeiemorgen'
    if (hour < 18) return 'Goeiemiddag'
    return 'Goeieavond'
  })()

  const todayLabel = now.toLocaleDateString('nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const monthLabel = now.toLocaleDateString('nl-BE', {
    timeZone: 'Europe/Brussels',
    month: 'long',
  })

  const REPORT_LABELS: Record<string, string> = {
    replace: 'Plant moet vervangen worden',
    sick: 'Plant lijkt ziek',
    damaged: 'Plant is beschadigd',
    pest: 'Ongedierte / aantasting',
    other: 'Andere opmerking',
  }

  function renderAgendaList(
    items: AgendaItem[],
    empty: string,
    showDay = false
  ) {
    if (items.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-stera-line p-3 text-center text-xs text-stera-ink-soft">
          {empty}
        </div>
      )
    }
    return (
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-stera-ink">
                  {item.line}
                  {item.badge ? (
                    <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-stera-ink-soft">
                      {item.badge}
                    </span>
                  ) : null}
                </p>
                {item.sub ? (
                  <p className="truncate text-xs text-stera-ink-soft">{item.sub}</p>
                ) : null}
              </div>
              {showDay ? (
                <div className="shrink-0 text-right text-xs">
                  <span className="block font-medium text-stera-ink">
                    {formatDay(item.scheduled_start)}
                  </span>
                  <span className="text-stera-ink-soft">
                    {formatTime(item.scheduled_start)}
                  </span>
                </div>
              ) : (
                <span className="shrink-0 text-sm font-medium text-stera-green">
                  {formatTime(item.scheduled_start)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-8 sm:pt-10">
      <div className="mx-auto max-w-4xl space-y-3 sm:space-y-6">
        {/* Begroeting en weer */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-serif text-3xl leading-none text-stera-green sm:text-4xl">
              {greeting}, Jelle
            </p>
            <p className="mt-1 text-xs text-stera-ink-soft">{todayLabel}</p>
          </div>
          {weather ? <WeatherPill weather={weather} /> : null}
        </div>

        {/* Werkbon-pipeline — geen snelle nav-links, geen offertes/vervangingen */}
        <OpsActionBoard ops={ops} />

        {/* Net goedgekeurde werkbonnen — melding tot Jelle ze opent */}
        {newlySignedWorkOrders && newlySignedWorkOrders.length > 0 ? (
          <section className="rounded-xl border border-stera-green/40 bg-stera-green/5 p-3 sm:p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stera-green">
              {newlySignedWorkOrders.length === 1
                ? '1 werkbon goedgekeurd'
                : `${newlySignedWorkOrders.length} werkbonnen goedgekeurd`}
            </p>
            <ul className="space-y-1.5">
              {newlySignedWorkOrders.map((wo: any) => {
                const v = Array.isArray(wo.maintenance_visits)
                  ? wo.maintenance_visits[0]
                  : wo.maintenance_visits
                const loc = Array.isArray(v?.locations)
                  ? v.locations[0]
                  : v?.locations
                const company = Array.isArray(loc?.companies)
                  ? loc.companies[0]
                  : loc?.companies
                const subtitle = [company?.name, loc?.name]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li key={wo.id}>
                    <Link
                      href={`/work-orders/${wo.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm hover:bg-stera-green/10"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-stera-ink">
                          {v?.title || 'Onderhoud'}
                        </span>
                        {subtitle ? (
                          <span className="text-stera-ink-soft"> · {subtitle}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs text-stera-ink-soft">
                        {wo.signed_name ? `door ${wo.signed_name}` : 'getekend'}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {/* Openstaande klantmeldingen */}
        {openReports && openReports.length > 0 ? (
          <section
            id="meldingen"
            className="scroll-mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
              {openReports.length === 1
                ? '1 openstaande klantmelding'
                : `${openReports.length} openstaande klantmeldingen`}
            </p>
            <ul className="space-y-1.5">
              {openReports.map((report: any) => {
                const plant = Array.isArray(report.plants)
                  ? report.plants[0]
                  : report.plants
                const plantName =
                  plant?.nickname ||
                  plant?.species ||
                  plant?.reference_code ||
                  'Plant'
                const label = REPORT_LABELS[report.issue_type] || 'Melding'
                return (
                  <li key={report.id}>
                    <Link
                      href={`/plants/${report.plant_id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm hover:bg-amber-100"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-stera-ink">
                          {plantName}
                        </span>
                        <span className="text-stera-ink-soft">
                          {' · '}
                          {label}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-stera-ink-soft">
                        {report.reporter_name
                          ? `door ${report.reporter_name}`
                          : formatDay(report.created_at)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {/* Snelle acties */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Link
            href="/scan"
            className="flex items-center gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-stera-cream-deep text-stera-green-deep">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
                <circle cx="12" cy="13" r="3.2" />
              </svg>
            </span>
            <span className="text-sm font-medium text-stera-ink">
              Scan plant
            </span>
          </Link>
          <Link
            href="/maintenance/new"
            className="flex items-center gap-3 rounded-xl border border-stera-line bg-white p-3 transition hover:border-stera-green"
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-stera-cream-deep text-stera-green-deep">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="text-sm font-medium text-stera-ink">
              Nieuwe afspraak
            </span>
          </Link>
        </div>

        {/* Agenda: vandaag · deze week · rest van de maand */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
                Agenda
              </p>
              <p className="text-sm text-stera-ink-soft">
                Geplande bezoeken — vandaag, deze week en de rest van {monthLabel}.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                href="/settings/agenda"
                className="text-xs font-medium text-stera-green underline-offset-4 hover:underline"
              >
                iPhone-koppeling
              </Link>
              <Link
                href="/maintenance?tab=planned"
                className="text-xs font-medium text-stera-green underline-offset-4 hover:underline"
              >
                Alle afspraken →
              </Link>
            </div>
          </div>

          {/* Vandaag */}
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
                Vandaag
                {todaysItems.length > 0 ? (
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-stera-ink-soft">
                    · {todaysItems.length}
                  </span>
                ) : null}
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
            {renderAgendaList(todaysItems, 'Geen afspraken vandaag.')}
          </div>

          {/* Deze week (na vandaag) */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
              Deze week
              {thisWeekItems.length > 0 ? (
                <span className="ml-1.5 font-normal normal-case tracking-normal text-stera-ink-soft">
                  · {thisWeekItems.length}
                </span>
              ) : null}
            </p>
            {renderAgendaList(
              thisWeekItems,
              'Geen verdere afspraken deze week.',
              true
            )}
          </div>

          {/* Rest van de maand (na deze week) */}
          {startOfNextWeek < startOfNextMonth ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
                Rest van {monthLabel}
                {restOfMonthItems.length > 0 ? (
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-stera-ink-soft">
                    · {restOfMonthItems.length}
                  </span>
                ) : null}
              </p>
              {renderAgendaList(
                restOfMonthItems,
                `Geen afspraken meer in ${monthLabel} na deze week.`,
                true
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
