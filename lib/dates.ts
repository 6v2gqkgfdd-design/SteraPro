/**
 * Datum- en tijdformat-helpers voor de hele app.
 *
 * Alles formatteert in Europe/Brussels en nl-BE — server-side
 * (Vercel = UTC) zou anders verkeerde tijden tonen. Gebruik deze
 * helpers ipv `new Date(...).toLocaleString(...)` overal waar we
 * een datum/tijd aan een gebruiker tonen.
 */

const TZ = 'Europe/Brussels'
const LOCALE = 'nl-BE'

function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

/** "12/05/2026" */
export function formatDateShort(
  value: string | Date | null | undefined
): string {
  const d = safeDate(value)
  if (!d) return ''
  return d.toLocaleDateString(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** "12 mei 2026" */
export function formatDateLong(
  value: string | Date | null | undefined
): string {
  const d = safeDate(value)
  if (!d) return ''
  return d.toLocaleDateString(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

/** "di 12 mei" — voor compact dashboard / komende-week-lijst. */
export function formatDayShort(
  value: string | Date | null | undefined
): string {
  const d = safeDate(value)
  if (!d) return ''
  return d.toLocaleDateString(LOCALE, {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** "14:00" */
export function formatTime(
  value: string | Date | null | undefined
): string {
  const d = safeDate(value)
  if (!d) return ''
  return d.toLocaleTimeString(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "12/05/2026, 14:00" — compact datum+tijd. */
export function formatDateTime(
  value: string | Date | null | undefined
): string {
  const d = safeDate(value)
  if (!d) return ''
  return d.toLocaleString(LOCALE, {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/** "12 mei 2026, 14:00" — lang format voor werkbon, mail, e.d. */
export function formatDateTimeLong(
  value: string | Date | null | undefined
): string {
  const d = safeDate(value)
  if (!d) return ''
  return d.toLocaleString(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
