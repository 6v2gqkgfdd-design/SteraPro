/**
 * Effectieve standplaats (Binnen/Buiten): Nieuwkoop-tag eerst, anders Stera-enrichment.
 */

export type LocationLabel = 'Binnen' | 'Buiten'

export type LocationSource = 'nieuwkoop' | 'manual' | 'rule' | 'none'

export type EffectiveLocation = {
  /** Effectieve labels voor filter/UI */
  locations: LocationLabel[]
  /** Waar de effectieve waarde vandaan komt */
  source: LocationSource
  /** Raw uit Nieuwkoop (kan leeg zijn) */
  fromNieuwkoop: LocationLabel[]
  /** Raw uit enrichment (kan leeg zijn) */
  fromEnrichment: LocationLabel[]
}

export function parseNkLocations(tags: unknown): LocationLabel[] {
  if (!Array.isArray(tags)) return []
  const t = tags.find((x: { Code?: string }) => x?.Code === 'Location') as
    | { Values?: Array<{ Description_NL?: string | null }> }
    | undefined
  const out: LocationLabel[] = []
  for (const v of t?.Values ?? []) {
    const nl = (v?.Description_NL ?? '').trim()
    if (nl === 'Binnen' || nl === 'Buiten') {
      if (!out.includes(nl)) out.push(nl)
    }
  }
  return out
}

export function enrichmentToLocations(
  binnen: boolean | null | undefined,
  buiten: boolean | null | undefined
): LocationLabel[] {
  const out: LocationLabel[] = []
  if (binnen === true) out.push('Binnen')
  if (buiten === true) out.push('Buiten')
  return out
}

/** Effectieve locatie: NK wint als die aanwezig is. */
export function resolveEffectiveLocation(opts: {
  tags?: unknown
  location_binnen?: boolean | null
  location_buiten?: boolean | null
  location_source?: string | null
}): EffectiveLocation {
  const fromNieuwkoop = parseNkLocations(opts.tags)
  const fromEnrichment = enrichmentToLocations(
    opts.location_binnen,
    opts.location_buiten
  )

  if (fromNieuwkoop.length > 0) {
    return {
      locations: fromNieuwkoop,
      source: 'nieuwkoop',
      fromNieuwkoop,
      fromEnrichment,
    }
  }
  if (fromEnrichment.length > 0) {
    const src =
      opts.location_source === 'rule' ? 'rule' : ('manual' as LocationSource)
    return {
      locations: fromEnrichment,
      source: src,
      fromNieuwkoop,
      fromEnrichment,
    }
  }
  return {
    locations: [],
    source: 'none',
    fromNieuwkoop,
    fromEnrichment,
  }
}

export const LOCATION_FILTER_OPTIONS = [
  { id: '', label: 'Locatie: alles' },
  { id: 'Binnen', label: 'Binnen' },
  { id: 'Buiten', label: 'Buiten' },
  { id: 'missing', label: 'Locatie ontbreekt' },
] as const
