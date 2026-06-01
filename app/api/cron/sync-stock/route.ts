/**
 * Dagelijkse voorraad-sync — aangeroepen door Vercel Cron.
 *
 * Draait op Vercel (heeft netwerk naar Nieuwkoop + Supabase). Haalt de
 * gewijzigde voorraad van de laatste dagen op en werkt nieuwkoop_stock bij
 * voor de itemcodes die in onze catalogus zitten.
 *
 * Beveiliging: Vercel Cron stuurt automatisch `Authorization: Bearer
 * <CRON_SECRET>` mee wanneer de env-var CRON_SECRET is gezet. We weigeren
 * alle andere aanroepen.
 *
 * Cron-schema staat in vercel.json.
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Hoeveel dagen terug we wijzigingen ophalen (ruim genoeg om een
// gemiste run op te vangen). Delta i.p.v. volledige feed = sneller +
// vriendelijker voor de rate limit van Nieuwkoop.
const LOOKBACK_DAYS = 3

export async function GET(request: Request) {
  // 1) Auth
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const NK_BASE = process.env.NIEUWKOOP_API_BASE_URL
  const NK_USER = process.env.NIEUWKOOP_API_USER
  const NK_PASS = process.env.NIEUWKOOP_API_PASSWORD
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!NK_BASE || !NK_USER || !NK_PASS || !SUPA_URL || !SUPA_KEY) {
    return NextResponse.json({ error: 'Env vars ontbreken' }, { status: 500 })
  }

  const authHeader =
    'Basic ' + Buffer.from(`${NK_USER}:${NK_PASS}`).toString('base64')
  const supabase = createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: false },
  })

  try {
    // 2) Gewijzigde voorraad ophalen (delta)
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const res = await fetch(`${NK_BASE}/stock?sysmodified=${since}`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Nieuwkoop /stock ${res.status}`, detail: text.slice(0, 200) },
        { status: 502 }
      )
    }
    const stock = (await res.json()) as Array<{
      Itemcode?: string
      StockAvailable?: number
      FirstAvailable?: string | null
      Sysmodified?: string | null
    }>

    // 3) Welke itemcodes zitten in onze catalogus? (gepagineerd)
    const known = new Set<string>()
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('nieuwkoop_products')
        .select('itemcode')
        .range(from, from + pageSize - 1)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!data || data.length === 0) break
      for (const r of data) known.add(r.itemcode as string)
      if (data.length < pageSize) break
      from += pageSize
    }

    // 4) Filteren + mappen + upserten
    const toTimestamp = (s?: string | null) =>
      !s ? null : s.includes('Z') ? s : s + 'Z'
    const rows = stock
      .filter((s) => s?.Itemcode && known.has(s.Itemcode))
      .map((s) => ({
        itemcode: s.Itemcode as string,
        stock_available:
          typeof s.StockAvailable === 'number' ? s.StockAvailable : 0,
        first_available: s.FirstAvailable ?? null,
        sysmodified: toTimestamp(s.Sysmodified),
        synced_at: new Date().toISOString(),
      }))

    let upserted = 0
    const BATCH = 500
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error } = await supabase
        .from('nieuwkoop_stock')
        .upsert(batch, { onConflict: 'itemcode' })
      if (error) {
        return NextResponse.json(
          { error: error.message, upserted },
          { status: 500 }
        )
      }
      upserted += batch.length
    }

    return NextResponse.json({
      ok: true,
      since,
      fetched: stock.length,
      matched: rows.length,
      upserted,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
