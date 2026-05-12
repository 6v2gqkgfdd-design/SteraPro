/**
 * Werkuren-tarief en bijhorende berekeningen voor op de werkbon.
 *
 * Tarief is in cents om afrondingsproblemen te vermijden. Wijzig het
 * hier en het verandert overal mee.
 */

/** € 45,00 excl. btw per uur. */
export const HOURLY_RATE_EUR_CENTS = 4500

/**
 * Aantal te factureren minuten op basis van start, eind en pauze-totaal.
 * Werktijd wordt afgerond naar boven op halfuren.
 */
export function billedMinutes(
  start: string | null,
  end: string | null,
  pauseMin: number | null
): number | null {
  if (!start || !end) return null
  const sm = new Date(start).getTime()
  const em = new Date(end).getTime()
  if (!Number.isFinite(sm) || !Number.isFinite(em)) return null
  const total = Math.max(0, Math.round((em - sm) / 60000))
  const work = Math.max(0, total - (pauseMin ?? 0))
  return Math.ceil(work / 30) * 30
}

/** "1u30", "2u00", "30min", ... */
export function formatBilledDuration(billed: number | null): string | null {
  if (billed == null) return null
  const h = Math.floor(billed / 60)
  const m = billed % 60
  return h > 0
    ? `${h}u${m === 0 ? '00' : m.toString().padStart(2, '0')}`
    : `${m}min`
}

/** "15 min pauze", "1u15 pauze", ... of null als geen pauze. */
export function formatPauseDuration(pauseMin: number | null): string | null {
  if (!pauseMin || pauseMin <= 0) return null
  if (pauseMin < 60) return `${pauseMin} min pauze`
  const h = Math.floor(pauseMin / 60)
  const m = pauseMin % 60
  return `${h}u${m === 0 ? '00' : m.toString().padStart(2, '0')} pauze`
}

/** Kost in cents op basis van te factureren minuten en het uurtarief. */
export function labourCostCents(billed: number | null): number | null {
  if (billed == null) return null
  return Math.round((billed / 60) * HOURLY_RATE_EUR_CENTS)
}

/**
 * Geformatteerde "van X tot Y"-tekst voor op de werkbon.
 * Zelfde dag → "Op 29 april 2026, van 14:00 tot 18:00".
 * Andere dag → "Van 29 april 2026, 22:00 tot 30 april 2026, 06:00".
 * Alleen start of eind → "Vanaf 29 april 2026, 14:00" / "Tot 29 april 2026, 18:00".
 * Server-side: gerendered in Europe/Brussels, niet de Vercel-UTC.
 */
export function formatWorkRangeText(
  start: string | null,
  end: string | null
): string | null {
  if (!start && !end) return null

  const dateFmt: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }
  const timeFmt: Intl.DateTimeFormatOptions = {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    minute: '2-digit',
  }

  const dateOf = (v: string) =>
    new Date(v).toLocaleDateString('nl-BE', dateFmt)
  const timeOf = (v: string) =>
    new Date(v).toLocaleTimeString('nl-BE', timeFmt)

  if (start && end) {
    const sDate = dateOf(start)
    const eDate = dateOf(end)
    const sTime = timeOf(start)
    const eTime = timeOf(end)
    if (sDate === eDate) {
      return `Op ${sDate}, van ${sTime} tot ${eTime}`
    }
    return `Van ${sDate}, ${sTime} tot ${eDate}, ${eTime}`
  }
  if (start) {
    return `Vanaf ${dateOf(start)}, ${timeOf(start)}`
  }
  return `Tot ${dateOf(end!)}, ${timeOf(end!)}`
}
