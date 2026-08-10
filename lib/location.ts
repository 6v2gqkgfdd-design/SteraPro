/**
 * Effectieve standplaats (Binnen/Buiten): Nieuwkoop-tag eerst, anders Stera-enrichment.
 *
 * Niet elk producttype heeft een standplaats — artificial, accessoires e.d. vallen erbuiten.
 *
 * Bronnen:
 *  - nieuwkoop → Location-tag van NK
 *  - manual    → handmatig in catalogus gezet
 *  - rule      → afgeleid door Stera (categorie / plantkennis) — NIET van NK
 */

export type LocationLabel = 'Binnen' | 'Buiten'

export type LocationSource = 'nieuwkoop' | 'manual' | 'rule' | 'none' | 'na'

/** Leesbare bronlabel voor UI. */
export function locationSourceLabel(source: LocationSource | string | null | undefined): string {
  switch (source) {
    case 'nieuwkoop':
      return 'Nieuwkoop'
    case 'manual':
      return 'Stera manueel'
    case 'rule':
      return 'Stera afgeleid (niet NK)'
    case 'na':
      return 'n.v.t.'
    case 'none':
      return 'ontbreekt'
    default:
      return source ? String(source) : 'onbekend'
  }
}

/** Catalogustypes waar Binnen/Buiten zinvol is. */
export const LOCATION_RELEVANT_TYPES = [
  'combinaties',
  'planten',
  'potten',
  'mos',
] as const

export type LocationRelevantType = (typeof LOCATION_RELEVANT_TYPES)[number]

export function locationAppliesToType(
  catalogType: string | null | undefined
): boolean {
  if (!catalogType) return false
  return (LOCATION_RELEVANT_TYPES as readonly string[]).includes(catalogType)
}

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
  {
    id: 'missing',
    label: 'Locatie ontbreekt (planten/potten/combis/mos)',
  },
] as const

// ---------------------------------------------------------------------------
// Afleiden (Stera-regels — niet van Nieuwkoop)
// ---------------------------------------------------------------------------

type TagEntry = {
  Code?: string | null
  Values?: Array<{ Description_NL?: string | null }> | null
}

function tagVals(tags: unknown, code: string): string[] {
  if (!Array.isArray(tags)) return []
  const t = (tags as TagEntry[]).find((x) => x?.Code === code)
  return (t?.Values ?? [])
    .map((v) => (v?.Description_NL ?? '').trim())
    .filter(Boolean)
}

function firstTempC(tags: unknown): number | null {
  for (const v of tagVals(tags, 'Temperature')) {
    const n = Number(String(v).replace(/[^\d.-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Catalogustype — zelfde logica als admin catalog search SQL. */
export function inferCatalogType(row: {
  group_description_nl?: string | null
  product_group_description_nl?: string | null
  main_group_description_nl?: string | null
}): string {
  const group = row.group_description_nl || ''
  const pg = row.product_group_description_nl || ''
  const main = row.main_group_description_nl || ''
  if (/^Combinaties/i.test(group)) return 'combinaties'
  if (/Mos|Mummie|Groene wanden/i.test(pg)) return 'mos'
  if (/Artificial/i.test(pg) || /Artificial/i.test(group)) return 'artificial'
  if (/Plantenbakken/i.test(pg)) return 'potten'
  if (main === 'Planten') return 'planten'
  if (/Hulpmiddelen|Decoratie|Substraat|Voeding|Documentatie|All-in/i.test(pg)) {
    return 'accessoires'
  }
  return 'other'
}

/**
 * Typische tropische / kamerplant-genera (grondcultuur zonder NK-locatie).
 * Geen exhaustieve taxonomie — voldoende voor catalogus-classificatie.
 */
const INDOOR_GENERA = [
  'aglaonema', 'alocasia', 'anthurium', 'aphelandra', 'asparagus', 'aspidistra',
  'begonia', 'calathea', 'chamaedorea', 'chlorophytum', 'cissus', 'clivia',
  'codiaeum', 'coffea', 'columnea', 'cordyline', 'croton', 'ctenanthe',
  'dieffenbachia', 'dracaena', 'epipremnum', 'fatsia', 'ficus', 'fittonia',
  'gardenia', 'gasteria', 'haworthia', 'hedera', 'hoya', 'kalanchoe',
  'maranta', 'monstera', 'neoregelia', 'nephrolepis', 'pachira', 'peperomia',
  'philodendron', 'pilea', 'platycerium', 'pothos', 'rhipsalis', 'saintpaulia',
  'sansevieria', 'schefflera', 'scindapsus', 'spathiphyllum', 'strelitzia',
  'stromanthe', 'syngonium', 'tradescantia', 'yucca', 'zamioculcas', 'zz',
  'aloe', 'crassula', 'echeveria', 'euphorbia', 'beaucarnea', 'nolina',
  'howea', 'chrysalidocarpus', 'dypsis', 'rhapis', 'areca', 'phoenix',
  'musa', 'caladium', 'goeppertia', 'homalomena', 'thaumatophyllum',
  'rhaphidophora', 'scindapsus', 'senecio', 'crassula', 'hylocereus',
  'sarracenia', 'nepenthes', 'dionaea', 'tillandsia', 'phalaenopsis',
  'cymbidium', 'dendrobium', 'oncidium', 'cattleya', 'vanda',
]

/** Outdoor / winterharde genera die vaak in grondcultuur zitten. */
const OUTDOOR_GENERA = [
  'abies', 'acer', 'aesculus', 'allium', 'alnus', 'amélanchier', 'amelanchier',
  'aquilegia', 'astilbe', 'berberis', 'betula', 'buxus', 'camellia', 'carex',
  'carpinus', 'catalpa', 'cedrus', 'cercis', 'chaenomeles', 'chamaecyparis',
  'clematis', 'cornus', 'corylus', 'cotoneaster', 'crataegus', 'cupressus',
  'cytisus', 'dahlia', 'deutzia', 'digitalis', 'eleagnus', 'elaeagnus',
  'euonymus', 'fagus', 'forsythia', 'fragaria', 'fraxinus', 'gaultheria',
  'geranium', 'ginkgo', 'gleditsia', 'hamamelis', 'hebe', 'helianthus',
  'helleborus', 'hemerocallis', 'heuchera', 'hibiscus', 'hosta', 'hydrangea',
  'ilex', 'iris', 'jasminum', 'juglans', 'juniperus', 'kerria', 'koelreuteria',
  'laburnum', 'lagerstroemia', 'larix', 'laurus', 'lavandula', 'ligustrum',
  'liquidambar', 'liriodendron', 'lonicera', 'magnolia', 'mahonia', 'malus',
  'metasequoia', 'miscanthus', 'nandina', 'narcissus', 'olea', 'osmanthus',
  'pachysandra', 'paeonia', 'pennisetum', 'philadelphus', 'photinia', 'picea',
  'pieris', 'pinus', 'platanus', 'potentilla', 'prunus', 'pseudotsuga',
  'pyrus', 'quercus', 'rhododendron', 'rhus', 'ribes', 'robinia', 'rosa',
  'rosmarinus', 'salix', 'sambucus', 'sedum', 'skimmia', 'sophora', 'spiraea',
  'syringa', 'taxus', 'thuja', 'tilia', 'trachelospermum', 'tsuga', 'ulmus',
  'viburnum', 'vinca', 'viola', 'weigela', 'wisteria', 'yucca filamentosa',
]

function firstGenus(description: string | null | undefined): string {
  if (!description) return ''
  // "Dracaena fragrans 'X' in Pot" → plant-deel vóór " in "
  const plant = description.split(/\s+in\s+/i)[0] || description
  const cleaned = plant.replace(/[()]/g, ' ').trim()
  const token = cleaned.split(/[\s,]+/).filter(Boolean)[0] || ''
  return token.toLowerCase()
}

export type InferredLocation = {
  /** null = n.v.t. of niet af te leiden */
  locations: LocationLabel[] | null
  reason: string
}

/**
 * Leid Binnen/Buiten af uit categorie + (optioneel) Temperature-tag + genus.
 * Wordt ALLEEN gebruikt als NK geen Location-tag heeft.
 * Resultaat hoort in product_enrichment met location_source = 'rule'.
 */
export function inferLocationFromProduct(row: {
  description?: string | null
  product_group_description_nl?: string | null
  main_group_description_nl?: string | null
  group_description_nl?: string | null
  item_variety_nl?: string | null
  tags?: unknown
}): InferredLocation {
  const pg = (row.product_group_description_nl || '').toLowerCase()
  const main = (row.main_group_description_nl || '').toLowerCase()
  const group = (row.group_description_nl || '').toLowerCase()
  const variety = (row.item_variety_nl || '').toLowerCase()
  const catalogType = inferCatalogType(row)

  // Types zonder standplaats
  if (
    catalogType === 'artificial' ||
    catalogType === 'accessoires' ||
    catalogType === 'other' ||
    /hulpmiddelen|documentatie|voeding|substraat|decoratie/i.test(pg)
  ) {
    return { locations: null, reason: 'type n.v.t. (geen plant/pot/combi/mos)' }
  }

  // --- Categorie-regels (sterkste signalen) ---
  if (/hydro/i.test(pg) || catalogType === 'planten' && /hydro/i.test(pg)) {
    return { locations: ['Binnen'], reason: 'categorie Hydrocultuur → binnen' }
  }
  if (catalogType === 'mos' || /mos|mummie|groene wanden/i.test(pg) || /mos/i.test(variety)) {
    return { locations: ['Binnen'], reason: 'categorie mos/groene wand → binnen' }
  }
  if (catalogType === 'combinaties' || /^combinaties/i.test(group) || /all-in/i.test(pg)) {
    // Combi's bij Stera zijn typisch interieur (plant + pot)
    return { locations: ['Binnen'], reason: 'categorie combinatie/All-in-1 → binnen' }
  }
  if (catalogType === 'potten' || /plantenbakken/i.test(pg)) {
    // Potten gaan zowel binnen als buiten
    return {
      locations: ['Binnen', 'Buiten'],
      reason: 'categorie plantenbakken → binnen + buiten',
    }
  }

  // --- Planten (grondcultuur e.d.): Temperature-tag + genus ---
  if (catalogType === 'planten' || main === 'planten') {
    const temp = firstTempC(row.tags)
    if (temp != null) {
      // NK: 15/10/5 = niet winterhard (binnen/orangerie); negatief = buiten
      if (temp >= 5) {
        return {
          locations: ['Binnen'],
          reason: `Temperature-tag ${temp}°C → niet winterhard → binnen`,
        }
      }
      if (temp < 0) {
        return {
          locations: ['Buiten'],
          reason: `Temperature-tag ${temp}°C → winterhard → buiten`,
        }
      }
    }

    const genus = firstGenus(row.description)
    if (genus) {
      if (INDOOR_GENERA.some((g) => genus === g || genus.startsWith(g))) {
        return {
          locations: ['Binnen'],
          reason: `genus “${genus}” → typische kamerplant → binnen`,
        }
      }
      if (OUTDOOR_GENERA.some((g) => genus === g || genus.startsWith(g))) {
        return {
          locations: ['Buiten'],
          reason: `genus “${genus}” → typische buitenplant → buiten`,
        }
      }
    }

    // Grondcultuur zonder signaal: geen gok
    return {
      locations: null,
      reason: 'plant zonder duidelijk binnen/buiten-signaal',
    }
  }

  return { locations: null, reason: 'geen toepasselijke regel' }
}

export function locationsToEnrichmentFlags(locations: LocationLabel[]): {
  location_binnen: boolean
  location_buiten: boolean
} {
  return {
    location_binnen: locations.includes('Binnen'),
    location_buiten: locations.includes('Buiten'),
  }
}
