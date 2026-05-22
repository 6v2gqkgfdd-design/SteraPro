import { NextResponse } from 'next/server'
import {
  getItems,
  filterReplacements,
  probeNieuwkoop,
  type NieuwkoopItem,
} from '@/lib/nieuwkoop'

export const runtime = 'nodejs'
export const maxDuration = 30

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
  const diagnose = url.searchParams.get('diagnose')

  try {
    // Diagnose-modus: eerst een verbindingstest (welke /items-oproep
    // werkt?), daarna — als er data binnenkomt — analyseren hoe
    // Nieuwkoop hydrocultuur labelt (tags / productgroepen / tekst).
    if (diagnose) {
      const probe = await probeNieuwkoop()
      return NextResponse.json({
        probe: {
          configuredBaseUrl: probe.configuredBaseUrl,
          attempts: probe.attempts,
        },
        diagnose:
          probe.items.length > 0 ? buildDiagnosis(probe.items) : null,
      })
    }

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

/**
 * Bouwt een overzicht van hoe Nieuwkoop zijn catalogus labelt, zodat
 * we kunnen vaststellen waar "hydrocultuur" zit:
 *  - tagCodes: alle voorkomende tag-categorieën met voorbeeldwaarden
 *  - groups: alle productgroepen met aantallen
 *  - hydroSamples: items die ergens het woord "hydro" vermelden
 */
function buildDiagnosis(items: NieuwkoopItem[]) {
  // 1. Distinct tag-codes met hun voorkomende waarden.
  const tagMap = new Map<string, Set<string>>()
  for (const it of items) {
    for (const tag of it.Tags ?? []) {
      if (!tag?.Code) continue
      if (!tagMap.has(tag.Code)) tagMap.set(tag.Code, new Set())
      const set = tagMap.get(tag.Code)!
      for (const v of tag.Values ?? []) {
        const label = v?.Description_NL || v?.Description_EN
        if (label) set.add(label)
      }
    }
  }
  const tagCodes = [...tagMap.entries()]
    .map(([code, values]) => ({ code, values: [...values].slice(0, 30) }))
    .sort((a, b) => a.code.localeCompare(b.code))

  // 2. Distinct productgroepen met aantallen.
  const groupMap = new Map<string, number>()
  for (const it of items) {
    const key =
      it.GroupDescription_NL ||
      it.ProductGroupCode ||
      it.MainGroupCode ||
      '(geen groep)'
    groupMap.set(key, (groupMap.get(key) ?? 0) + 1)
  }
  const groups = [...groupMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // 3. Items die ergens "hydro" vermelden (in eender welk veld).
  const hydroItems = items.filter((it) =>
    JSON.stringify(it).toLowerCase().includes('hydro')
  )
  const hydroSamples = hydroItems.slice(0, 10).map((it) => ({
    Itemcode: it.Itemcode,
    Description: it.Description,
    ItemVariety_NL: it.ItemVariety_NL,
    MainGroupCode: it.MainGroupCode,
    ProductGroupCode: it.ProductGroupCode,
    GroupDescription_NL: it.GroupDescription_NL,
    Tags: it.Tags,
  }))

  return {
    totalItems: items.length,
    hydroMentionCount: hydroItems.length,
    hydroSamples,
    tagCodes,
    groups,
  }
}
