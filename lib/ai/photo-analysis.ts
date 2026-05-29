/**
 * AI-foto-analyse voor vervangingsslots.
 *
 * Stuurt de foto's van de te vervangen planten naar Claude Hauku Vision
 * en vraagt om per plant een inschatting van:
 *   - hoogte (cm)
 *   - lichtbehoefte (zon / half-schaduw / schaduw)
 *   - diameter van de binnenpot (cm)
 *   - pot-vorm (Rond / Hoekig) — zodat het auto-voorstel een
 *     visueel consistente combinatie kiest.
 *
 * Die inschattingen vullen de slot-condities aan wanneer de tech
 * niets manueel ingaf, zodat het auto-voorstel beter scoort.
 *
 * Alle foto's worden in één enkele Claude-call gestuurd — dat scheelt
 * tijd en geld vergeleken met N losse calls.
 */

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export type AiSlotInput = {
  visitPlantId: string
  photoUrl: string | null
  oldPlantName: string
  oldPlantSpecies: string | null
}

export type PotShape = 'Rond' | 'Hoekig'

export type AiSlotInsight = {
  heightCm: number | null
  light: 'high' | 'medium' | 'low' | null
  potDiameterCm: number | null
  potShape: PotShape | null
}

function parsePotShape(raw: unknown): PotShape | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  if (v === 'rond' || v === 'round') return 'Rond'
  if (
    v === 'hoekig' ||
    v === 'vierkant' ||
    v === 'rechthoek' ||
    v === 'square' ||
    v === 'rectangular' ||
    v === 'rectangle'
  ) {
    return 'Hoekig'
  }
  return null
}

const LIGHT_FROM_CATALOG: Record<string, 'high' | 'medium' | 'low'> = {
  zon: 'high',
  'half-schaduw': 'medium',
  halfschaduw: 'medium',
  schaduw: 'low',
}

function parseLight(raw: unknown): 'high' | 'medium' | 'low' | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  return LIGHT_FROM_CATALOG[key] ?? null
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string') {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/**
 * Analyseer foto's van de gegeven slots en return een map met de
 * AI-inschattingen per visitPlantId. Lege map bij configuratie- of
 * API-fout (de aanroeper kan dan gewoon doorgaan zonder AI-aanvulling).
 */
export async function analyzeReplacementPhotos(
  slots: AiSlotInput[]
): Promise<Map<string, AiSlotInsight>> {
  const result = new Map<string, AiSlotInsight>()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[ai-photo] ANTHROPIC_API_KEY ontbreekt — sla AI-analyse over')
    return result
  }

  const withPhotos = slots.filter((s) => !!s.photoUrl)
  if (withPhotos.length === 0) return result

  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'url'; url: string } }

  const content: ContentBlock[] = []
  for (const [i, slot] of withPhotos.entries()) {
    const label = `Plant ${i + 1} — id ${slot.visitPlantId} — ${slot.oldPlantName}${
      slot.oldPlantSpecies ? ` (${slot.oldPlantSpecies})` : ''
    }`
    content.push({ type: 'text', text: label })
    content.push({
      type: 'image',
      source: { type: 'url', url: slot.photoUrl! },
    })
  }

  content.push({
    type: 'text',
    text: [
      'Voor ELKE plant hierboven, schat op basis van de foto:',
      '- height_cm: hoogte van de plant in cm (zonder pot, het zichtbare bovengrondse deel).',
      '- light: lichtbehoefte voor deze plek — "zon", "half-schaduw" of "schaduw" — op basis van het zichtbare daglicht in de omgeving.',
      '- pot_diameter_cm: diameter van de binnenpot in cm (geschat).',
      '- pot_shape: vorm van de zichtbare buitenpot — "Rond" wanneer de pot rond/cilindrisch/ovaal/bol is, "Hoekig" wanneer de pot vierkant/rechthoekig/kubusvormig is. Geef null als de pot niet duidelijk zichtbaar is.',
      '',
      'Antwoord ENKEL met geldige JSON, zonder code-blok of toelichting, in dit exacte formaat:',
      '[{"id":"<visitPlantId>","height_cm":<number|null>,"light":"<zon|half-schaduw|schaduw|null>","pot_diameter_cm":<number|null>,"pot_shape":"<Rond|Hoekig|null>"}, ...]',
      '',
      'Geef null als je iets echt niet kan inschatten. Behoud de volgorde en de id-velden.',
    ].join('\n'),
  })

  let res: Response
  try {
    res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      }),
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai-photo] fetch error', err)
    return result
  }

  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(
      '[ai-photo] api error',
      res.status,
      await res.text().catch(() => '')
    )
    return result
  }

  let data: unknown
  try {
    data = await res.json()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai-photo] json parse error', err)
    return result
  }

  const text =
    (data as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? ''
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  let arr: unknown
  try {
    arr = JSON.parse(cleaned)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai-photo] response not JSON', err, cleaned.slice(0, 200))
    return result
  }

  if (!Array.isArray(arr)) return result

  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id : null
    if (!id) continue
    result.set(id, {
      heightCm: parseNumber(item.height_cm),
      light: parseLight(item.light),
      potDiameterCm: parseNumber(item.pot_diameter_cm),
      potShape: parsePotShape(item.pot_shape),
    })
  }

  return result
}
