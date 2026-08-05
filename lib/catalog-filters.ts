/**
 * Catalogus-filtertypes en labels (gedeeld client/server).
 */

export type CatalogType =
  | 'combinaties'
  | 'planten'
  | 'potten'
  | 'artificial'
  | 'mos'
  | 'accessoires'
  | 'other'

export const CATALOG_TYPES: { id: CatalogType | ''; label: string }[] = [
  { id: '', label: 'Alle types' },
  { id: 'combinaties', label: 'Combinaties (plant+pot)' },
  { id: 'planten', label: 'Losse planten' },
  { id: 'potten', label: 'Potten & bakken' },
  { id: 'artificial', label: 'Artificial' },
  { id: 'mos', label: 'Mos & groene wanden' },
  { id: 'accessoires', label: 'Accessoires & overig' },
]

export const PRICE_BANDS: { id: string; label: string; min: number | null; max: number | null }[] = [
  { id: '', label: 'Alle prijzen', min: null, max: null },
  { id: '0-25', label: 'Inkoop < €25', min: 0, max: 25 },
  { id: '25-75', label: '€25 – €75', min: 25, max: 75 },
  { id: '75-150', label: '€75 – €150', min: 75, max: 150 },
  { id: '150-plus', label: '€150+', min: 150, max: null },
]

export const HEIGHT_BANDS: { id: string; label: string; min: number | null; max: number | null }[] = [
  { id: '', label: 'Alle hoogtes', min: null, max: null },
  { id: '0-40', label: '< 40 cm', min: 0, max: 40 },
  { id: '40-80', label: '40 – 80 cm', min: 40, max: 80 },
  { id: '80-120', label: '80 – 120 cm', min: 80, max: 120 },
  { id: '120-plus', label: '120 cm+', min: 120, max: null },
]

export const STOCK_OPTIONS = [
  { id: '', label: 'Voorraad: alles' },
  { id: 'in', label: 'Met voorraad' },
  { id: 'out', label: 'Zonder voorraad (op bestelling)' },
]

export const PHOTO_OPTIONS = [
  { id: '', label: 'Foto: alles' },
  { id: 'yes', label: 'Met NK-foto' },
  { id: 'no', label: 'Zonder NK-foto' },
]

export const OPTIMIZED_OPTIONS = [
  { id: '', label: 'Status: alles' },
  { id: 'yes', label: 'Afgewerkt ✓' },
  { id: 'no', label: 'Nog niet afgewerkt' },
]

export const OFFERED_OPTIONS = [
  { id: '', label: 'Aangeboden: alles' },
  { id: 'yes', label: 'Al aangeboden' },
  { id: 'no', label: 'Nog niet aangeboden' },
]

/** @deprecated gebruik LOCATION_FILTER_OPTIONS uit lib/location.ts */
export const LOCATION_OPTIONS = [
  { id: '', label: 'Locatie: alles' },
  { id: 'Binnen', label: 'Binnen' },
  { id: 'Buiten', label: 'Buiten' },
  { id: 'missing', label: 'Locatie ontbreekt' },
]

/** Classificeer een productrij naar ons type-aanbod. */
export function classifyCatalogType(row: {
  main_group_description_nl?: string | null
  product_group_description_nl?: string | null
  group_description_nl?: string | null
}): CatalogType {
  const g = (row.group_description_nl || '').trim()
  const p = (row.product_group_description_nl || '').trim()
  const m = (row.main_group_description_nl || '').trim()

  if (/^Combinaties/i.test(g)) return 'combinaties'
  if (/Mos|Mummie|Groene wanden/i.test(p) || /\bmos\b/i.test(g)) return 'mos'
  if (/Artificial/i.test(p) || /Artificial/i.test(g)) return 'artificial'
  if (/Plantenbakken/i.test(p)) return 'potten'
  if (/^Planten$/i.test(m)) return 'planten'
  if (
    /Hulpmiddelen|Decoratie|Substraat|Voeding|Documentatie|All-in/i.test(p) ||
    /accessoir/i.test(g)
  ) {
    return 'accessoires'
  }
  return 'other'
}

export function tagValues(tags: unknown, code: string): string[] {
  if (!Array.isArray(tags)) return []
  const t = tags.find((x: { Code?: string }) => x?.Code === code) as
    | { Values?: Array<{ Description_NL?: string | null }> }
    | undefined
  return (t?.Values ?? [])
    .map((v) => (v?.Description_NL ?? '').trim())
    .filter(Boolean)
}

export function extractPlantsoort(description: string | null | undefined): string {
  if (!description) return ''
  const beforeIn = description.split(/\s+in\s+/i)[0] ?? description
  const first = beforeIn.split(/[\s'",]+/).filter(Boolean)[0] ?? ''
  if (!first) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}
