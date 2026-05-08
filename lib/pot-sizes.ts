/**
 * Standaard binnenpot-maten (containerformaten).
 *
 * Jelle gebruikt deze C-codes om de maat van een plantpot te
 * specificeren. Bij verpotting gaat een plant doorgaans één maat
 * groter zodat we automatisch de volgende kunnen voorstellen.
 *
 * estimatedPriceCents = ruwe inschatting voor de werkbon. Niet
 * exact — Jelle heeft gezegd dat we mogen raden tot er echte data is.
 */

export type PotSize = {
  code: string
  liters: number
  /** Diameter range in cm. */
  minDiameter: number
  maxDiameter: number
  /** Geschatte prijs in cents (voor de werkbon, voor plant-binnenpot). */
  estimatedPriceCents: number
}

export const POT_SIZES: PotSize[] = [
  { code: 'C1', liters: 1, minDiameter: 11, maxDiameter: 13, estimatedPriceCents: 350 },
  { code: 'C1,3', liters: 1.3, minDiameter: 13, maxDiameter: 13, estimatedPriceCents: 400 },
  { code: 'C1,5', liters: 1.5, minDiameter: 13, maxDiameter: 15, estimatedPriceCents: 450 },
  { code: 'C2', liters: 2, minDiameter: 17, maxDiameter: 17, estimatedPriceCents: 550 },
  { code: 'C2,5', liters: 2.5, minDiameter: 18, maxDiameter: 18, estimatedPriceCents: 650 },
  { code: 'C3', liters: 3, minDiameter: 19, maxDiameter: 21, estimatedPriceCents: 750 },
  { code: 'C4', liters: 4, minDiameter: 21, maxDiameter: 23, estimatedPriceCents: 900 },
  { code: 'C5', liters: 5, minDiameter: 22, maxDiameter: 24, estimatedPriceCents: 1100 },
  { code: 'C7,5', liters: 7.5, minDiameter: 26, maxDiameter: 26, estimatedPriceCents: 1500 },
  { code: 'C10', liters: 10, minDiameter: 28, maxDiameter: 30, estimatedPriceCents: 2000 },
  { code: 'C12', liters: 12, minDiameter: 30, maxDiameter: 32, estimatedPriceCents: 2400 },
  { code: 'C15', liters: 15, minDiameter: 33, maxDiameter: 35, estimatedPriceCents: 2900 },
  { code: 'C20', liters: 20, minDiameter: 35, maxDiameter: 38, estimatedPriceCents: 3700 },
]

/** Vind een potmaat op basis van zijn code. */
export function findPotSize(code: string | null | undefined): PotSize | null {
  if (!code) return null
  return POT_SIZES.find((p) => p.code === code) ?? null
}

/** Toonbare label, bv. "C3 — Ø 19-21 cm (3 L)". */
export function formatPotSize(p: PotSize): string {
  const range =
    p.minDiameter === p.maxDiameter
      ? `Ø ${p.minDiameter} cm`
      : `Ø ${p.minDiameter}-${p.maxDiameter} cm`
  return `${p.code} — ${range} (${p.liters} L)`
}

/**
 * Eén maat groter dan de gegeven code. Geeft null terug als we al
 * aan de grootste maat zitten of de code niet bestaat.
 */
export function nextPotSize(code: string | null | undefined): PotSize | null {
  if (!code) return null
  const idx = POT_SIZES.findIndex((p) => p.code === code)
  if (idx < 0 || idx >= POT_SIZES.length - 1) return null
  return POT_SIZES[idx + 1]
}

/** Format een prijs in cents als "€ 12,50". */
export function formatEur(cents: number | null | undefined): string {
  if (cents == null) return '—'
  const euros = cents / 100
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(euros)
}
