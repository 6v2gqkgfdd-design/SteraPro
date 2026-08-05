/**
 * Serveert productmedia: studio (enrichment) of origineel (Nieuwkoop-cache).
 *
 * GET /api/product-media/{itemcode}?variant=studio|original
 *  - studio: path uit product_enrichment.studio_image_path in bucket nieuwkoop-images
 *  - original: redirect naar bestaande /api/nieuwkoop/image/{itemcode}
 *
 * POST /api/product-media/{itemcode}  (staff, multipart field "file")
 *  - upload studiofoto → storage studio/{itemcode}.ext
 *  - update product_enrichment.studio_image_path
 */

import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { defaultStudioPath, MEDIA_BUCKET } from '@/lib/product-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ITEMCODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ itemcode: string }> }
) {
  const { itemcode: raw } = await ctx.params
  const itemcode = decodeURIComponent(raw || '').trim()
  if (!ITEMCODE_PATTERN.test(itemcode)) {
    return NextResponse.json({ error: 'Ongeldige itemcode' }, { status: 400 })
  }

  const url = new URL(request.url)
  const variant = url.searchParams.get('variant') || 'studio'

  if (variant === 'original') {
    return NextResponse.redirect(
      new URL(`/api/nieuwkoop/image/${encodeURIComponent(itemcode)}`, request.url),
      302
    )
  }

  // studio
  const sb = admin()
  const { data: enr } = await sb
    .from('product_enrichment')
    .select('studio_image_path')
    .eq('itemcode', itemcode)
    .maybeSingle()

  const path = enr?.studio_image_path as string | null
  if (!path) {
    // Geen studio → val terug op origineel
    return NextResponse.redirect(
      new URL(`/api/nieuwkoop/image/${encodeURIComponent(itemcode)}`, request.url),
      302
    )
  }

  const { data: signed, error } = await sb.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 3600)

  if (error || !signed?.signedUrl) {
    // Publieke URL proberen
    const { data: pub } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path)
    if (pub?.publicUrl) {
      return NextResponse.redirect(pub.publicUrl, 302)
    }
    return NextResponse.redirect(
      new URL(`/api/nieuwkoop/image/${encodeURIComponent(itemcode)}`, request.url),
      302
    )
  }

  return NextResponse.redirect(signed.signedUrl, 302)
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ itemcode: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) return NextResponse.json({ error: 'Geen beheerder' }, { status: 403 })

  const { itemcode: raw } = await ctx.params
  const itemcode = decodeURIComponent(raw || '').trim()
  if (!ITEMCODE_PATTERN.test(itemcode)) {
    return NextResponse.json({ error: 'Ongeldige itemcode' }, { status: 400 })
  }

  const form = await request.formData()
  const file = form.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Geen bestand (field: file)' }, { status: 400 })
  }

  const mime = file.type || 'image/jpeg'
  const ext =
    mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const path = defaultStudioPath(itemcode, ext)
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > 12 * 1024 * 1024) {
    return NextResponse.json({ error: 'Bestand te groot (max 12 MB)' }, { status: 400 })
  }

  const sb = admin()
  const { error: upErr } = await sb.storage.from(MEDIA_BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: true,
  })
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const now = new Date().toISOString()
  const { error: dbErr } = await sb.from('product_enrichment').upsert(
    {
      itemcode,
      studio_image_path: path,
      updated_at: now,
    },
    { onConflict: 'itemcode' }
  )
  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    path,
    url: `/api/product-media/${encodeURIComponent(itemcode)}?variant=studio&t=${Date.now()}`,
  })
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ itemcode: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) return NextResponse.json({ error: 'Geen beheerder' }, { status: 403 })

  const { itemcode: raw } = await ctx.params
  const itemcode = decodeURIComponent(raw || '').trim()
  if (!ITEMCODE_PATTERN.test(itemcode)) {
    return NextResponse.json({ error: 'Ongeldige itemcode' }, { status: 400 })
  }

  const sb = admin()
  const { data: enr } = await sb
    .from('product_enrichment')
    .select('studio_image_path')
    .eq('itemcode', itemcode)
    .maybeSingle()

  if (enr?.studio_image_path) {
    await sb.storage.from(MEDIA_BUCKET).remove([enr.studio_image_path as string])
  }

  await sb
    .from('product_enrichment')
    .update({ studio_image_path: null, updated_at: new Date().toISOString() })
    .eq('itemcode', itemcode)

  return NextResponse.json({ ok: true })
}
