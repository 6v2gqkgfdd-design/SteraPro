/**
 * Dagelijkse catalogus-sync (ochtend).
 *
 * - Full pull van alle Nieuwkoop-items → Supabase
 * - Voorraad-sync
 * - Change-inbox vullen (nieuw / prijs / specs / verdwenen / weer op voorraad)
 *
 * Schema: vercel.json → 0 4 * * * (UTC) ≈ 06:00 BE in zomer.
 * Beveiliging: Authorization: Bearer <CRON_SECRET>
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runCatalogMorningSync } from '@/lib/nieuwkoop-catalog-sync'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
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

  const supabase = createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: false },
  })

  // Full = 1×/dag volledige catalogus (Nieuwkoop best practice).
  // Query ?mode=delta voor snelle hertest.
  const url = new URL(request.url)
  const mode = url.searchParams.get('mode') === 'delta' ? 'delta' : 'full'

  try {
    const result = await runCatalogMorningSync(
      supabase,
      { NK_BASE, NK_USER, NK_PASS },
      { mode, lookbackDays: 3 }
    )
    const status = result.errors.length ? 207 : 200
    return NextResponse.json(result, { status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
