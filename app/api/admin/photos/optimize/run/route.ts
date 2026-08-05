/**
 * Verwerkt 1 pending foto-job (studio + detail + maat).
 * POST — optioneel { itemcode } om een specifieke te forceren.
 *
 * Vercel maxDuration 300s — één product per call (Grok + sharp).
 */

import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePhotosetForItem } from '@/lib/photo-pipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) return NextResponse.json({ error: 'Geen beheerder' }, { status: 403 })

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'XAI_API_KEY ontbreekt op de server (Vercel env). Nodig voor Grok Imagine studiofoto’s.',
      },
      { status: 500 }
    )
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  let wantCode: string | null = null
  try {
    const body = await request.json()
    if (body?.itemcode) wantCode = String(body.itemcode).trim().toUpperCase()
  } catch {
    /* empty body ok */
  }

  // Claim volgende pending job
  let job: { id: string; itemcode: string } | null = null

  if (wantCode) {
    // Ad-hoc: maak/gebruik job voor dit item
    const { data: inserted } = await admin
      .from('photo_optimize_jobs')
      .insert({ itemcode: wantCode, status: 'running', started_at: new Date().toISOString() })
      .select('id, itemcode')
      .single()
    job = inserted
  } else {
    const { data: next } = await admin
      .from('photo_optimize_jobs')
      .select('id, itemcode')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!next) {
      return NextResponse.json({
        ok: true,
        done: false,
        message: 'Geen pending jobs meer.',
        remaining: 0,
      })
    }

    const { data: claimed, error: claimErr } = await admin
      .from('photo_optimize_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', next.id)
      .eq('status', 'pending')
      .select('id, itemcode')
      .maybeSingle()

    if (claimErr || !claimed) {
      return NextResponse.json({
        ok: true,
        done: false,
        message: 'Job was al opgepikt. Probeer opnieuw.',
      })
    }
    job = claimed
  }

  if (!job) {
    return NextResponse.json({ ok: false, error: 'Geen job' }, { status: 500 })
  }

  try {
    const result = await generatePhotosetForItem(job.itemcode)
    await admin
      .from('photo_optimize_jobs')
      .update({
        status: 'done',
        finished_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', job.id)

    const { count: remaining } = await admin
      .from('photo_optimize_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    return NextResponse.json({
      ok: true,
      done: true,
      itemcode: job.itemcode,
      paths: result,
      remaining: remaining ?? 0,
      message: `${job.itemcode}: studio + detail + maat klaar.`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    await admin
      .from('photo_optimize_jobs')
      .update({
        status: 'error',
        finished_at: new Date().toISOString(),
        error: msg.slice(0, 500),
      })
      .eq('id', job.id)

    const { count: remaining } = await admin
      .from('photo_optimize_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    return NextResponse.json(
      {
        ok: false,
        itemcode: job.itemcode,
        error: msg,
        remaining: remaining ?? 0,
      },
      { status: 500 }
    )
  }
}
