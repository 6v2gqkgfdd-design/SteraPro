import { NextResponse } from 'next/server'
import {
  getItems,
  filterReplacements,
  type NieuwkoopItem,
} from '@/lib/nieuwkoop'

/**
 * GET /api/nieuwkoop/items
 *
 * Query-parameters:
 *   ?sysmodified=2025-01-01    → alle items aangepast sinds die datum
 *   ?itemCode=6BSCC609P        → één specifieke SKU
 *   ?search=ficus              → filter op tekst in description/variety
 *   ?height=120                → filter op hoogte (±20%)
 *   ?potDiameter=24            → filter op pot-diameter (±2 cm)
 *   ?light=high|medium|low     → filter op lichtbehoefte
 *
 * Standaard wordt enkel mainGroupCode=100 (planten) opgehaald.
 *
 * Auth: deze route is enkel toegankelijk voor ingelogde gebruikers
 * (basic auth-credentials voor Nieuwkoop staan server-side).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  // 2000-01-01 = "alle items" volgens de Nieuwkoop docs.
  // We filteren mainGroupCode niet via de URL (Playground accepteert
  // dat soms niet) — we doen het client-side in filterReplacements.
  const sysmodified =
    url.searchParams.get('sysmodified') || '2000-01-01'
  const itemCode = url.searchParams.get('itemCode') || undefined
  const search = url.searchParams.get('search')
  const heightStr = url.searchParams.get('height')
  const potDiameterStr = url.searchParams.get('potDiameter')
  const lightRaw = url.searchParams.get('light')

  try {
    const items: NieuwkoopItem[] = await getItems({
      sysmodified,
      itemCode,
    })

    const filtered = filterReplacements(items, {
      height: heightStr ? Number(heightStr) : null,
      potDiameter: potDiameterStr ? Number(potDiameterStr) : null,
      light:
        lightRaw === 'high' || lightRaw === 'medium' || lightRaw === 'low'
          ? lightRaw
          : null,
      searchTerm: search,
    })

    return NextResponse.json({
      total: items.length,
      filtered: filtered.length,
      items: filtered.slice(0, 50),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
