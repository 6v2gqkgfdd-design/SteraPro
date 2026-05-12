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

/** Kost in cents op basis van te factureren minuten en het uurtarief. */
export function labourCostCents(billed: number | null): number | null {
  if (billed == null) return null
  return Math.round((billed / 60) * HOURLY_RATE_EUR_CENTS)
}
