/**
 * Dagelijkse voorraad Supabase → Shopify.
 *
 * vercel.json → 0 6 * * * UTC, na sync-stock (05:00).
 * Dry-run tenzij SHOPIFY_INVENTORY_SYNC_LIVE=1.
 * Auth: Authorization: Bearer <CRON_SECRET>, zelfde patroon als de andere crons.
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runShopifyInventorySync } from '@/lib/shopify-inventory-sync'

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

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPA_URL || !SUPA_KEY) {
    return NextResponse.json({ error: 'Env vars ontbreken' }, { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: false },
  })

  // ?dry=1 dwingt een read-only run, ook als de live-vlag aanstaat.
  const forceDry = new URL(request.url).searchParams.get('dry') === '1'

  try {
    const report = await runShopifyInventorySync({
      supabase,
      ...(forceDry ? { live: false } : {}),
    })
    const status = report.dry_run
      ? 200
      : report.guard.blocked
        ? 409
        : report.ok
          ? 200
          : 500
    return NextResponse.json(report, { status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    console.error('sync-shopify-inventory failed', msg)
    return NextResponse.json({ ok: false, error: msg, writes: false }, { status: 500 })
  }
}
