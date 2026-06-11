/**
 * TIJDELIJK read-only export-endpoint voor agent-sessies (Cowork/Claude).
 *
 * Waarom: de agent-sandbox kan niet rechtstreeks bij Supabase, maar wel
 * bij deze app. Dit endpoint proxiet een GET-query naar PostgREST met de
 * service-role key, beveiligd met CRON_SECRET.
 *
 * Gebruik: /api/agent-export?secret=<CRON_SECRET>&q=<postgrest-query>
 *   bv. q=plants?select=id,species&status=eq.dead
 *
 * ⚠️ Verwijderen zodra de offerte-taak afgerond is.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = url.searchParams.get('q')
  if (!q || q.includes('..') || !/^[a-z_]+(\?|$)/.test(q)) {
    return NextResponse.json({ error: 'Invalid q' }, { status: 400 })
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${q}`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: 'no-store',
    }
  )

  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  })
}
