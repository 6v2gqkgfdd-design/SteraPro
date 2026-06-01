/**
 * Nieuwkoop Europe Customer API — basic auth + typed helpers.
 *
 * Drie omgevingen, geconfigureerd via NIEUWKOOP_API_BASE_URL:
 *   - Playground: https://customerapi_playground.nieuwkoop-europe.com
 *   - Dev:        https://customerapi_dev.nieuwkoop-europe.com
 *   - Live:       https://customerapi.nieuwkoop-europe.com
 *
 * Authenticatie via Basic Auth — username/password in env vars
 * (NIEUWKOOP_API_USER, NIEUWKOOP_API_PASSWORD).
 *
 * Rate limits: gebruik /items?sysmodified=2000-01-01 max 1× per dag voor
 * de volledige catalogus, en daarna sysmodified=<laatste-fetch> voor
 * delta's. Voor prototyping op de Playground (demo data) maakt het niet
 * uit, maar voor Live moeten we de resultaten in Supabase cachen.
 */

const DEFAULT_BASE_URL = 'https://customerapi_playground.nieuwkoop-europe.com'

function getBaseUrl(): string {
  return process.env.NIEUWKOOP_API_BASE_URL || DEFAULT_BASE_URL
}

function authHeader(): string {
  const username = process.env.NIEUWKOOP_API_USER
  const password = process.env.NIEUWKOOP_API_PASSWORD
  if (!username || !password) {
    throw new Error(
      'NIEUWKOOP_API_USER en NIEUWKOOP_API_PASSWORD ontbreken in de environment.'
    )
  }
  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return `Basic ${token}`
}

/**
 * VEILIGHEIDSGRENS — voorkomt dat er per ongeluk besteld wordt.
 *
 * Alle huidige Nieuwkoop-calls zijn lees-acties (GET). Schrijf-acties
 * (POST/PUT/PATCH/DELETE) zoals het plaatsen van een bestelling worden
 * hard geblokkeerd, tenzij NIEUWKOOP_ALLOW_ORDERS expliciet op 'true'
 * staat. Zo kan een live-koppeling nooit ongewild een order versturen.
 */
function assertReadOnly(method: string | undefined): void {
  const m = (method || 'GET').toUpperCase()
  if (m === 'GET' || m === 'HEAD') return
  if (process.env.NIEUWKOOP_ALLOW_ORDERS === 'true') return
  throw new Error(
    `Nieuwkoop schrijf-actie (${m}) geblokkeerd: order-guard staat aan. ` +
      `Zet NIEUWKOOP_ALLOW_ORDERS=true om dit bewust toe te laten.`
  )
}

async function nkFetch<T>(path: string, init?: RequestInit): Promise<T> {
  assertReadOnly(init?.method)
  const url = `${getBaseUrl()}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: authHeader(),
      Accept: 'application/json',
    },
    // Geen Next.js fetch cache — we beslissen zelf wanneer we cachen.
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Nieuwkoop API ${res.status} ${res.statusText} bij ${path}: ${text.slice(0, 200)}`
    )
  }

  return (await res.json()) as T
}

/**
 * Een enkele SKU zoals Nieuwkoop ze teruggeeft. We typen enkel de
 * velden die we vandaag gebruiken — de rest blijft `unknown` zodat
 * de TypeScript-types niet uit de hand lopen.
 */
export type NieuwkoopItem = {
  Itemcode: string
  Description: string
  ItemDescription_NL?: string
  ItemDescription_EN?: string
  ItemVariety_NL?: string
  ItemPictureName?: string
  ItemStatus?: 'A' | 'E' | 'D' | 'B' | string
  MainGroupCode?: string
  ProductGroupCode?: string
  GroupDescription_NL?: string
  PotSize?: string
  Diameter?: number
  Height?: number
  Width?: number
  Length?: number
  Depth?: number
  Opening?: number
  Content_Ltr?: string
  LeafSize?: string
  Salesprice?: number
  IsStockItem?: boolean
  IsOffer?: boolean
  ShowOnWebsite?: boolean
  DiameterCulturePot?: number
  HeightCulturePot?: number
  Weight?: number
  LocationIcon_NL?: string
  LocationUsagePlanters_NL?: string
  Sysmodified?: string
  Tags?: Array<{
    Code: string
    Values?: Array<{
      Description_NL?: string
      Description_EN?: string
    }>
  }>
}

export type GetItemsOptions = {
  /** ISO-datum, bv. '2025-01-01'. '2000-01-01' = alles. */
  sysmodified?: string
  /** Eén specifieke SKU ophalen. */
  itemCode?: string
  /** '100' = planten, '200' = hardware. */
  mainGroupCode?: '100' | '200'
}

export async function getItems(
  opts: GetItemsOptions = {}
): Promise<NieuwkoopItem[]> {
  const params = new URLSearchParams()
  if (opts.sysmodified) params.set('sysmodified', opts.sysmodified)
  if (opts.itemCode) params.set('itemCode', opts.itemCode)
  if (opts.mainGroupCode) params.set('mainGroupCode', opts.mainGroupCode)

  const qs = params.toString()
  return nkFetch<NieuwkoopItem[]>(`/items${qs ? `?${qs}` : ''}`)
}

/** URL van de afbeelding voor een SKU (geen fetch — direct embedden). */
export function getItemImageUrl(itemCode: string): string {
  return `${getBaseUrl()}/items/${encodeURIComponent(itemCode)}/image`
}

/**
 * Client-side filter op een items-lijst: zoek planten die passen bij
 * de vervangingsspecs van een visit_plant.
 *
 * - height: gewenste hoogte in cm, met tolerantie van ±20%.
 * - potDiameter: gewenste pot-diameter in cm, met tolerantie van ±2 cm.
 * - light: optioneel. Zoekt in LocationIcon_NL op trefwoorden
 *   ("zon" / "schaduw"). Niet exact — meer een eerste filter.
 */
export function filterReplacements(
  items: NieuwkoopItem[],
  opts: {
    height?: number | null
    potDiameter?: number | null
    light?: 'high' | 'medium' | 'low' | null
    searchTerm?: string | null
  }
): NieuwkoopItem[] {
  const { height, potDiameter, light, searchTerm } = opts
  const term = (searchTerm || '').trim().toLowerCase()

  return items.filter((it) => {
    // Alleen actieve planten
    if (it.ItemStatus && it.ItemStatus !== 'A') return false
    if (it.MainGroupCode && it.MainGroupCode !== '100') return false

    if (height && it.Height) {
      const min = height * 0.8
      const max = height * 1.2
      if (it.Height < min || it.Height > max) return false
    }

    if (potDiameter) {
      const d = it.DiameterCulturePot ?? it.Diameter
      if (d && Math.abs(d - potDiameter) > 2) return false
    }

    if (light) {
      const icon = (it.LocationIcon_NL || '').toLowerCase()
      if (light === 'high' && !icon.includes('zon')) return false
      if (light === 'low' && !icon.includes('schaduw')) return false
      // medium = geen extra filter — laat alle door
    }

    if (term) {
      const haystack = [
        it.Description,
        it.ItemDescription_NL,
        it.ItemVariety_NL,
        it.GroupDescription_NL,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(term)) return false
    }

    return true
  })
}

// ─────────────────────────────────────────────────────────────────
// Verbindingstest
// ─────────────────────────────────────────────────────────────────

export type NieuwkoopProbeAttempt = {
  environment: string
  baseUrl: string
  path: string
  ok: boolean
  status: number | null
  itemCount: number | null
  error: string | null
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const NIEUWKOOP_ENVIRONMENTS = [
  {
    name: 'Playground',
    baseUrl: 'https://customerapi_playground.nieuwkoop-europe.com',
  },
  {
    name: 'Dev',
    baseUrl: 'https://customerapi_dev.nieuwkoop-europe.com',
  },
  {
    name: 'Live',
    baseUrl: 'https://customerapi.nieuwkoop-europe.com',
  },
]

/**
 * Verbindingstest voor de Nieuwkoop API. Probeert dezelfde /items-
 * oproep op alle drie de omgevingen (Playground, Dev, Live) met de
 * huidige login, telkens met twee datums. Zo zien we meteen welke
 * omgeving bruikbare data teruggeeft.
 *
 * `items` bevat de resultaten van de eerste geslaagde poging mét data.
 */
export async function probeNieuwkoop(): Promise<{
  configuredBaseUrl: string
  attempts: NieuwkoopProbeAttempt[]
  items: NieuwkoopItem[]
}> {
  const configuredBaseUrl = getBaseUrl()
  const dates = ['2024-01-01', '2026-01-01']

  let auth: string | null = null
  let authError: string | null = null
  try {
    auth = authHeader()
  } catch (e) {
    authError =
      e instanceof Error ? e.message : 'Authenticatie-config ontbreekt.'
  }

  const jobs: Array<{
    environment: string
    baseUrl: string
    path: string
  }> = []
  for (const env of NIEUWKOOP_ENVIRONMENTS) {
    for (const date of dates) {
      jobs.push({
        environment: env.name,
        baseUrl: env.baseUrl,
        path: `/items?sysmodified=${date}`,
      })
    }
  }

  async function runOne(job: {
    environment: string
    baseUrl: string
    path: string
  }): Promise<{ attempt: NieuwkoopProbeAttempt; items: NieuwkoopItem[] }> {
    const base = {
      environment: job.environment,
      baseUrl: job.baseUrl,
      path: job.path,
    }
    if (!auth) {
      return {
        attempt: {
          ...base,
          ok: false,
          status: null,
          itemCount: null,
          error: authError,
        },
        items: [],
      }
    }
    try {
      const res = await fetchWithTimeout(
        `${job.baseUrl}${job.path}`,
        {
          headers: { Authorization: auth, Accept: 'application/json' },
          cache: 'no-store',
        },
        12000
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return {
          attempt: {
            ...base,
            ok: false,
            status: res.status,
            itemCount: null,
            error: text.slice(0, 300) || res.statusText,
          },
          items: [],
        }
      }
      const data = (await res.json()) as unknown
      const list = Array.isArray(data) ? (data as NieuwkoopItem[]) : []
      return {
        attempt: {
          ...base,
          ok: true,
          status: res.status,
          itemCount: list.length,
          error: null,
        },
        items: list,
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === 'AbortError'
            ? 'Time-out na 12s'
            : e.message
          : 'Netwerkfout'
      return {
        attempt: {
          ...base,
          ok: false,
          status: null,
          itemCount: null,
          error: msg,
        },
        items: [],
      }
    }
  }

  const results = await Promise.all(jobs.map(runOne))
  const attempts = results.map((r) => r.attempt)
  const firstOk = results.find((r) => r.items.length > 0)
  return {
    configuredBaseUrl,
    attempts,
    items: firstOk ? firstOk.items : [],
  }
}
