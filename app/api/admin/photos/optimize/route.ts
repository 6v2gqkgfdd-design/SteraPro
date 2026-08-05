/**
 * Foto-optimalisatie batch voor aangeboden, nog niet afgewerkte producten.
 *
 * GET  — status + count kandidaten / jobs
 * POST — jobs in de wachtrij zetten (offered && !optimized)
 *        body: { limit?: number, itemcodes?: string[] }
 */

import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 }) }
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) return { error: NextResponse.json({ error: 'Geen beheerder' }, { status: 403 }) }
  return {
    admin: createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    ),
  }
}

export async function GET() {
  const auth = await requireStaff()
  if ('error' in auth && auth.error) return auth.error
  const admin = auth.admin!

  // Aangeboden itemcodes
  const { data: offered } = await admin
    .from('shopify_offered_items')
    .select('itemcode')
    .eq('offered', true)

  const codes = (offered || []).map((r) => r.itemcode as string)
  let needOptimize = 0
  let withStudio = 0
  let optimized = 0

  if (codes.length) {
    // enrichment voor deze codes
    const { data: enr } = await admin
      .from('product_enrichment')
      .select('itemcode, optimized, studio_image_path, detail_image_path, maat_image_path')
      .in('itemcode', codes)

    const by = new Map((enr || []).map((e) => [e.itemcode as string, e]))
    for (const c of codes) {
      const e = by.get(c)
      if (e?.optimized) optimized++
      if (e?.studio_image_path) withStudio++
      if (!e?.optimized) needOptimize++
    }
  }

  const { data: jobs } = await admin
    .from('photo_optimize_jobs')
    .select('status')
    .in('status', ['pending', 'running'])

  const pending = (jobs || []).filter((j) => j.status === 'pending').length
  const running = (jobs || []).filter((j) => j.status === 'running').length

  const { count: doneRecent } = await admin
    .from('photo_optimize_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'done')
    .gte('finished_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())

  const { count: errRecent } = await admin
    .from('photo_optimize_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'error')
    .gte('finished_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())

  return NextResponse.json({
    ok: true,
    offered: codes.length,
    needOptimize,
    withStudio,
    optimized,
    queue: { pending, running },
    last24h: { done: doneRecent ?? 0, errors: errRecent ?? 0 },
  })
}

export async function POST(request: Request) {
  const auth = await requireStaff()
  if ('error' in auth && auth.error) return auth.error
  const admin = auth.admin!

  let body: { limit?: number; itemcodes?: string[]; force?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200)
  const force = !!body.force

  let candidates: string[] = []

  if (body.itemcodes?.length) {
    candidates = body.itemcodes.map((c) => c.trim().toUpperCase()).filter(Boolean)
  } else {
    const { data: offered } = await admin
      .from('shopify_offered_items')
      .select('itemcode')
      .eq('offered', true)

    const codes = (offered || []).map((r) => r.itemcode as string)
    if (!codes.length) {
      return NextResponse.json({ ok: true, enqueued: 0, message: 'Geen aangeboden producten.' })
    }

    const { data: enr } = await admin
      .from('product_enrichment')
      .select('itemcode, optimized, studio_image_path')
      .in('itemcode', codes)

    const by = new Map((enr || []).map((e) => [e.itemcode as string, e]))
    for (const c of codes) {
      const e = by.get(c)
      if (force) {
        candidates.push(c)
        continue
      }
      // Nog niet afgewerkt = kandidaat (ook zonder studio)
      if (!e?.optimized) candidates.push(c)
    }
  }

  // Skip al pending/running
  const { data: active } = await admin
    .from('photo_optimize_jobs')
    .select('itemcode')
    .in('status', ['pending', 'running'])

  const busy = new Set((active || []).map((r) => r.itemcode as string))
  const toQueue = candidates.filter((c) => !busy.has(c)).slice(0, limit)

  if (!toQueue.length) {
    return NextResponse.json({
      ok: true,
      enqueued: 0,
      message: 'Niets te plannen (alles al in queue of afgewerkt).',
    })
  }

  const rows = toQueue.map((itemcode) => ({
    itemcode,
    status: 'pending' as const,
  }))

  const { error } = await admin.from('photo_optimize_jobs').insert(rows)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    enqueued: toQueue.length,
    itemcodes: toQueue,
    message: `${toQueue.length} producten in de wachtrij. Start “Verwerk volgende”.`,
  })
}
