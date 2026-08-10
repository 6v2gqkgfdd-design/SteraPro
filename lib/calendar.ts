/**
 * Agenda-koppeling iPhone ↔ SteraPro.
 *
 * Export: alle geplande beurten als ICS-feed (iPhone abonneert zich).
 * Import: publieke iCloud-ICS van de "SteraPro"-kalender → maintenance_visits.
 *
 * Eigen exports hebben UID `stera-visit-{uuid}@sterapro.be` en worden bij
 * import overgeslagen, zodat er geen lus ontstaat.
 */

import ical from 'node-ical'
import type { SupabaseClient } from '@supabase/supabase-js'
import { matchCompanyId as matchCompanyFromText } from '@/lib/company-match'

export const APP_EVENT_UID_PREFIX = 'stera-visit-'
export const APP_EVENT_UID_DOMAIN = 'sterapro.be'

export function appVisitUid(visitId: string): string {
  return `${APP_EVENT_UID_PREFIX}${visitId}@${APP_EVENT_UID_DOMAIN}`
}

export function isAppOwnedUid(uid: string | null | undefined): boolean {
  if (!uid) return false
  return uid.startsWith(APP_EVENT_UID_PREFIX) || uid.endsWith(`@${APP_EVENT_UID_DOMAIN}`)
}

/** webcal:// → https:// (iCloud public calendar links). */
export function normalizeIcsUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (t.startsWith('webcal://')) return 'https://' + t.slice('webcal://'.length)
  if (t.startsWith('webcals://')) return 'https://' + t.slice('webcals://'.length)
  return t
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** UTC timestamp in ICS basic format: 20260810T143000Z */
export function toIcsUtc(d: Date): string {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

/** Escape text for ICS property values. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

/** Fold long ICS lines at 75 octets (approx chars for ASCII). */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  return parts.join('\r\n')
}

export type VisitForIcs = {
  id: string
  title: string | null
  scheduled_start: string
  scheduled_end: string | null
  status: string
  access_notes: string | null
  internal_notes: string | null
  planned_tasks: string | null
  locations?: {
    name?: string | null
    street?: string | null
    number?: string | null
    postal_code?: string | null
    city?: string | null
    companies?: { name?: string | null } | { name?: string | null }[] | null
  } | null
}

function locationAddress(visit: VisitForIcs): string {
  const loc = visit.locations
  if (!loc) return ''
  const company = Array.isArray(loc.companies) ? loc.companies[0] : loc.companies
  const street = [loc.street, loc.number].filter(Boolean).join(' ').trim()
  const city = [loc.postal_code, loc.city].filter(Boolean).join(' ').trim()
  return [company?.name, loc.name, street, city].filter(Boolean).join(', ')
}

function visitSummary(visit: VisitForIcs): string {
  const loc = visit.locations
  const company = loc
    ? Array.isArray(loc.companies)
      ? loc.companies[0]
      : loc.companies
    : null
  const parts = [company?.name, loc?.name, visit.title].filter(Boolean)
  return parts.join(' · ') || 'SteraPro onderhoud'
}

/**
 * Bouw een ICS-kalender van app-beurten (voor abonnement op iPhone).
 */
export function buildVisitsIcs(
  visits: VisitForIcs[],
  opts: { siteUrl: string; calName?: string }
): string {
  const now = toIcsUtc(new Date())
  const site = opts.siteUrl.replace(/\/$/, '')
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SteraPro//Agenda//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.calName || 'SteraPro')}`,
    'X-WR-TIMEZONE:Europe/Brussels',
  ]

  for (const v of visits) {
    if (!v.scheduled_start) continue
    if (v.status === 'cancelled') continue

    const start = new Date(v.scheduled_start)
    if (Number.isNaN(start.getTime())) continue
    const end = v.scheduled_end
      ? new Date(v.scheduled_end)
      : new Date(start.getTime() + 90 * 60 * 1000)

    const descParts = [
      v.planned_tasks && `Taken: ${v.planned_tasks}`,
      v.access_notes && `Toegang: ${v.access_notes}`,
      v.internal_notes && `Nota: ${v.internal_notes}`,
      `Open in app: ${site}/maintenance/${v.id}`,
    ].filter(Boolean) as string[]

    const loc = locationAddress(v)

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${appVisitUid(v.id)}`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(`DTSTART:${toIcsUtc(start)}`)
    lines.push(`DTEND:${toIcsUtc(end)}`)
    lines.push(foldLine(`SUMMARY:${icsEscape(visitSummary(v))}`))
    if (loc) lines.push(foldLine(`LOCATION:${icsEscape(loc)}`))
    if (descParts.length) {
      lines.push(foldLine(`DESCRIPTION:${icsEscape(descParts.join('\n'))}`))
    }
    lines.push(`URL:${site}/maintenance/${v.id}`)
    if (v.status === 'completed') lines.push('STATUS:CONFIRMED')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export type ParsedCalEvent = {
  uid: string
  summary: string
  description: string | null
  location: string | null
  start: Date
  end: Date | null
  status: 'confirmed' | 'tentative' | 'cancelled'
}

export async function parseIcsEvents(icsText: string): Promise<ParsedCalEvent[]> {
  // node-ical: sync parseICS is betrouwbaar voor string-input
  const data = ical.parseICS(icsText) as Record<string, {
    type?: string
    uid?: string
    start?: Date
    end?: Date
    summary?: string | { val?: string }
    description?: string
    location?: string
    status?: string
  }>

  const out: ParsedCalEvent[] = []
  for (const key of Object.keys(data)) {
    const ev = data[key]
    if (!ev || ev.type !== 'VEVENT') continue
    if (!ev.uid || !ev.start) continue

    const start = ev.start instanceof Date ? ev.start : new Date(ev.start)
    if (Number.isNaN(start.getTime())) continue

    let end: Date | null = null
    if (ev.end) {
      const e = ev.end instanceof Date ? ev.end : new Date(ev.end)
      if (!Number.isNaN(e.getTime())) end = e
    }

    const st = String(ev.status || 'CONFIRMED').toUpperCase()
    const status: ParsedCalEvent['status'] =
      st === 'CANCELLED' ? 'cancelled' : st === 'TENTATIVE' ? 'tentative' : 'confirmed'

    const summaryRaw =
      typeof ev.summary === 'string'
        ? ev.summary
        : ev.summary && typeof ev.summary === 'object' && 'val' in ev.summary
          ? String(ev.summary.val || '')
          : 'Agenda'

    out.push({
      uid: String(ev.uid),
      summary: summaryRaw.trim() || 'Agenda',
      description: ev.description ? String(ev.description).trim() : null,
      location: ev.location ? String(ev.location).trim() : null,
      start,
      end,
      status,
    })
  }
  return out
}

export type SyncResult = {
  ok: boolean
  message: string
  created: number
  updated: number
  cancelled: number
  skipped: number
}

/**
 * Haal de publieke ICS op en synchroniseer naar maintenance_visits.
 * Enkel events mét calendar_source = 'iphone' worden bijgewerkt/geannuleerd;
 * app-eigen UID's worden overgeslagen.
 */
export async function syncIcsIntoVisits(
  supabase: SupabaseClient,
  importUrl: string
): Promise<SyncResult> {
  const url = normalizeIcsUrl(importUrl)
  if (!url) {
    return {
      ok: false,
      message: 'Geen import-URL geconfigureerd',
      created: 0,
      updated: 0,
      cancelled: 0,
      skipped: 0,
    }
  }

  const res = await fetch(url, {
    headers: { Accept: 'text/calendar, text/plain, */*' },
    cache: 'no-store',
  })
  if (!res.ok) {
    return {
      ok: false,
      message: `ICS ophalen mislukt (${res.status})`,
      created: 0,
      updated: 0,
      cancelled: 0,
      skipped: 0,
    }
  }

  const text = await res.text()
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    return {
      ok: false,
      message: 'Antwoord is geen geldige ICS-kalender',
      created: 0,
      updated: 0,
      cancelled: 0,
      skipped: 0,
    }
  }

  const events = await parseIcsEvents(text)

  // Bedrijfsnamen — slimme match (BV/spaties/tokens), zie lib/company-match.ts
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .order('name', { ascending: true })

  const companyList = (companies ?? []) as { id: string; name: string }[]

  function matchCompanyId(summary: string, description: string | null): string | null {
    return matchCompanyFromText(summary, description, companyList)
  }

  // Bestaande geïmporteerde visits
  const { data: existingRows } = await supabase
    .from('maintenance_visits')
    .select('id, calendar_uid, status, scheduled_start, title, company_id')
    .eq('calendar_source', 'iphone')

  const byUid = new Map<
    string,
    { id: string; status: string; company_id: string | null }
  >()
  for (const row of existingRows ?? []) {
    const r = row as {
      calendar_uid: string | null
      id: string
      status: string
      company_id: string | null
    }
    if (r.calendar_uid) {
      byUid.set(r.calendar_uid, {
        id: r.id,
        status: r.status,
        company_id: r.company_id,
      })
    }
  }

  let created = 0
  let updated = 0
  let cancelled = 0
  let skipped = 0
  const seenUids = new Set<string>()

  for (const ev of events) {
    if (isAppOwnedUid(ev.uid)) {
      skipped++
      continue
    }
    seenUids.add(ev.uid)

    const companyId = matchCompanyId(ev.summary, ev.description)
    const scheduledStart = ev.start.toISOString()
    const scheduledEnd = ev.end ? ev.end.toISOString() : null
    const notes = [
      ev.location && `Locatie (agenda): ${ev.location}`,
      ev.description,
      'Geïmporteerd uit iPhone-agenda',
    ]
      .filter(Boolean)
      .join('\n')

    const existing = byUid.get(ev.uid)

    if (ev.status === 'cancelled') {
      if (existing && existing.status === 'scheduled') {
        const { error } = await supabase
          .from('maintenance_visits')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        if (!error) cancelled++
      } else {
        skipped++
      }
      continue
    }

    if (existing) {
      // Niet overschrijven als de beurt al bezig/afgerond is
      if (['in_progress', 'paused', 'completed'].includes(existing.status)) {
        skipped++
        continue
      }
      // company_id: match wint; anders bestaande koppeling behouden
      const nextCompany = companyId || existing.company_id || null

      const { error } = await supabase
        .from('maintenance_visits')
        .update({
          title: ev.summary,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          company_id: nextCompany,
          internal_notes: notes,
          status: 'scheduled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (!error) updated++
    } else {
      const { error } = await supabase.from('maintenance_visits').insert({
        title: ev.summary,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        company_id: companyId,
        location_id: null,
        status: 'scheduled',
        calendar_uid: ev.uid,
        calendar_source: 'iphone',
        internal_notes: notes,
      })
      if (!error) created++
    }
  }

  // Events die uit de feed verdwenen zijn → annuleer geplande imports
  for (const [uid, row] of byUid) {
    if (seenUids.has(uid)) continue
    if (row.status !== 'scheduled') continue
    const { error } = await supabase
      .from('maintenance_visits')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (!error) cancelled++
  }

  const message = `Import OK: ${created} nieuw, ${updated} bijgewerkt, ${cancelled} geannuleerd, ${skipped} overgeslagen`
  return { ok: true, message, created, updated, cancelled, skipped }
}
