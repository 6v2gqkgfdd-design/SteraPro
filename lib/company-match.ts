/**
 * Slimme klantmatching voor agenda-titels e.d.
 *
 * "Real legal" moet "BV Reallegal" raken, "711" → "711", enz.
 */

export type CompanyMatchInput = {
  id: string
  name: string
}

/** Verwijder accenten, lowercase, niet-alfanumeriek → spatie. */
export function normalizeText(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Compacte vorm zonder spaties (real legal → reallegal). */
export function compactText(s: string): string {
  return normalizeText(s).replace(/\s+/g, '')
}

const LEGAL_PREFIXES = new Set([
  'bv',
  'bva',
  'nv',
  'sa',
  'sprl',
  'srl',
  'vof',
  'cv',
  'cvs',
  'vzw',
  'asbl',
  'gmbh',
  'ltd',
  'llc',
  'inc',
  'bvba',
  'commv',
])

/** Naam zonder juridische prefix (BV, NV, …). */
export function stripLegalPrefix(name: string): string {
  const n = normalizeText(name)
  const parts = n.split(' ')
  while (parts.length > 1 && LEGAL_PREFIXES.has(parts[0])) {
    parts.shift()
  }
  return parts.join(' ')
}

/**
 * Vind de best passende company-id in titel/omschrijving.
 * Langste / meest specifieke match wint.
 */
export function matchCompanyId(
  summary: string,
  description: string | null | undefined,
  companies: CompanyMatchInput[]
): string | null {
  const hayNorm = normalizeText(`${summary} ${description || ''}`)
  const hayCompact = compactText(`${summary} ${description || ''}`)
  if (!hayNorm && !hayCompact) return null

  let best: { id: string; score: number } | null = null

  for (const c of companies) {
    const raw = (c.name || '').trim()
    if (!raw) continue

    const fullNorm = normalizeText(raw)
    const coreNorm = stripLegalPrefix(raw)
    const fullCompact = compactText(raw)
    const coreCompact = compactText(coreNorm)

    // Te korte kernels overslaan (voorkomt "nv" / "bv" false positives)
    if (coreCompact.length < 3 && fullCompact.length < 3) continue

    let score = 0

    // Exacte genormaliseerde naam in de tekst
    if (fullNorm.length >= 3 && hayNorm.includes(fullNorm)) {
      score = Math.max(score, 100 + fullNorm.length)
    }
    // Kern zonder BV/NV
    if (coreNorm.length >= 3 && hayNorm.includes(coreNorm)) {
      score = Math.max(score, 90 + coreNorm.length)
    }
    // Compact: "real legal" ↔ "reallegal" / "BV Reallegal"
    if (coreCompact.length >= 3 && hayCompact.includes(coreCompact)) {
      score = Math.max(score, 85 + coreCompact.length)
    }
    if (fullCompact.length >= 3 && hayCompact.includes(fullCompact)) {
      score = Math.max(score, 80 + fullCompact.length)
    }

    // Alle betekenisvolle tokens van de kern komen voor in de titel
    const tokens = coreNorm.split(' ').filter((t) => t.length >= 2)
    if (tokens.length >= 2 && tokens.every((t) => hayNorm.includes(t))) {
      score = Math.max(score, 70 + tokens.join('').length)
    }

    // Enkel token (bv. "711") — alleen als token op woordgrens lijkt
    if (tokens.length === 1 && tokens[0].length >= 3) {
      const t = tokens[0]
      const re = new RegExp(`(?:^|\\s)${escapeRe(t)}(?:\\s|$)`)
      if (re.test(hayNorm)) {
        score = Math.max(score, 60 + t.length)
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { id: c.id, score }
    }
  }

  return best?.id ?? null
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type LocationMatchInput = {
  id: string
  company_id: string
  name: string | null
  street: string | null
  number: string | null
  city: string | null
  postal_code: string | null
}

/**
 * Vind de best passende locatie voor een agenda-event.
 *
 * Prioriteit:
 * 1. Adresmatch (straat + huisnummer) in LOCATION / titel / beschrijving
 * 2. Locatienaam of stad
 * 3. Enige locatie van de gekoppelde klant (standaard)
 */
export function matchLocationId(
  opts: {
    companyId: string | null
    summary: string
    description: string | null | undefined
    icsLocation: string | null | undefined
  },
  locations: LocationMatchInput[]
): string | null {
  const { companyId, summary, description, icsLocation } = opts
  const hayNorm = normalizeText(
    `${summary} ${description || ''} ${icsLocation || ''}`
  )
  const hayCompact = compactText(hayNorm)

  const pool = companyId
    ? locations.filter((l) => l.company_id === companyId)
    : locations

  if (pool.length === 0) return null

  let best: { id: string; score: number } | null = null

  for (const loc of pool) {
    let score = 0
    const street = normalizeText(loc.street || '')
    const number = normalizeText(String(loc.number || '').replace(/\//g, ' '))
    const city = normalizeText(loc.city || '')
    const name = normalizeText(loc.name || '')
    const postal = normalizeText(loc.postal_code || '')

    // Straat + nummer (sterkste signaal, bv. "Gistelsesteenweg 300")
    if (street.length >= 3) {
      const streetInHay = hayNorm.includes(street)
      if (streetInHay && number) {
        // nummer mag "300" of "265 0202" zijn
        const numToken = number.split(' ')[0]
        if (numToken && hayNorm.includes(numToken)) {
          score = Math.max(score, 120 + street.length)
        } else {
          score = Math.max(score, 70 + street.length)
        }
      } else if (streetInHay) {
        score = Math.max(score, 70 + street.length)
      }
      // compact: gistelsesteenweg300
      const streetNumCompact = compactText(`${loc.street || ''} ${loc.number || ''}`)
      if (streetNumCompact.length >= 5 && hayCompact.includes(streetNumCompact)) {
        score = Math.max(score, 130)
      }
    }

    if (name.length >= 3 && hayNorm.includes(name)) {
      score = Math.max(score, 50 + name.length)
    }
    if (city.length >= 3 && hayNorm.includes(city)) {
      score = Math.max(score, 30 + city.length)
    }
    if (postal.length >= 4 && hayNorm.includes(postal)) {
      score = Math.max(score, 40)
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { id: loc.id, score }
    }
  }

  if (best) return best.id

  // Standaard: enige locatie van deze klant
  if (companyId && pool.length === 1) {
    return pool[0].id
  }

  // Geen company maar exact 1 locatie-match wereldwijd is riskant → skip
  return null
}
