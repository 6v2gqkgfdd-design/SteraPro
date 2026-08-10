/**
 * Periodieke import van de iPhone/iCloud "SteraPro"-kalender (ICS).
 * Vercel Cron: elke 15 minuten.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { syncIcsIntoVisits } from '@/lib/calendar'

export const runtime = 'nodejs'
export const maxDuration = 60
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

  const { data: settings } = await supabase
    .from('calendar_sync_settings')
    .select('import_ics_url')
    .eq('id', 1)
    .maybeSingle()

  if (!settings?.import_ics_url) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: 'Geen import-URL geconfigureerd',
    })
  }

  const result = await syncIcsIntoVisits(supabase, settings.import_ics_url)

  await supabase
    .from('calendar_sync_settings')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_ok: result.ok,
      last_sync_message: result.message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
