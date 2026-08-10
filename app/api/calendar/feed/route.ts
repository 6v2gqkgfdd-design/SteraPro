/**
 * Publieke ICS-feed van SteraPro-beurten (gemaakt in de app).
 * Abonneer hierop vanaf je iPhone → je ziet app-afspraken in Agenda.
 *
 * Auth: ?token=<feed_token> uit calendar_sync_settings.
 *
 * Events met calendar_source = 'iphone' worden niet geëxporteerd, zodat
 * er geen dubbels ontstaan met je iCloud "SteraPro"-kalender.
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { buildVisitsIcs, type VisitForIcs } from '@/lib/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim()
  if (!token) {
    return new NextResponse('Missing token', { status: 401 })
  }

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPA_URL || !SUPA_KEY) {
    return new NextResponse('Server misconfigured', { status: 500 })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: false },
  })

  const { data: settings } = await supabase
    .from('calendar_sync_settings')
    .select('feed_token')
    .eq('id', 1)
    .maybeSingle()

  if (!settings?.feed_token || settings.feed_token !== token) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Horizon: 30 dagen terug + 1 jaar vooruit
  const from = new Date()
  from.setDate(from.getDate() - 30)
  const to = new Date()
  to.setFullYear(to.getFullYear() + 1)

  const { data: visits, error } = await supabase
    .from('maintenance_visits')
    .select(
      `id, title, scheduled_start, scheduled_end, status, calendar_source,
       access_notes, internal_notes, planned_tasks,
       locations ( name, street, number, postal_code, city, companies ( name ) )`
    )
    .gte('scheduled_start', from.toISOString())
    .lte('scheduled_start', to.toISOString())
    .neq('status', 'cancelled')
    .order('scheduled_start', { ascending: true })

  if (error) {
    return new NextResponse(`Query failed: ${error.message}`, { status: 500 })
  }

  const rawSite =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://app.sterapro.be')
  const siteUrl = rawSite.startsWith('http') ? rawSite : `https://${rawSite}`

  const exportable = (
    (visits ?? []) as (VisitForIcs & { calendar_source?: string | null })[]
  ).filter((v) => v.calendar_source !== 'iphone')

  const body = buildVisitsIcs(exportable, {
    siteUrl,
    calName: 'SteraPro App',
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="sterapro.ics"',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
