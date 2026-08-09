/**
 * Serveert productmedia: studio / detail / maat / origineel.
 *
 * GET /api/product-media/{itemcode}?variant=studio|detail|maat|original&size=thumb|full
 *  - thumb: klein JPEG (~320px) voor snelle catalogus-thumbs
 *  - full:  volledige resolutie
 *  - studio/detail/maat uit product_enrichment + storage
 *  - bij corrupte/ontbrekende studio → fallback origineel (NK)
 *
 * POST /api/product-media/{itemcode}  (staff, multipart field "file")
 * DELETE /api/product-media/{itemcode}  (staff, verwijdert studio)
 */

import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { defaultStudioPath, MEDIA_BUCKET } from '@/lib/product-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ITEMCODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const THUMB_PX = 320
const FULL_MAX_PX = 2048

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function isValidImageMagic(buf: Buffer): boolean {
  if (buf.byteLength < 4) return false
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  const isPng =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  const isWebp =
    buf.byteLength >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  return isJpeg || isPng || isWebp
}

function nkFallbackUrl(itemcode: string, requestUrl: string, size: string) {
  const u = new URL(
    `/api/nieuwkoop/image/${encodeURIComponent(itemcode)}`,
    requestUrl
  )
  if (size === 'thumb') u.searchParams.set('size', 'thumb')
  return u
}

async function resizeToJpeg(
  buf: Buffer,
  size: 'thumb' | 'full'
): Promise<Buffer> {
  const max = size === 'thumb' ? THUMB_PX : FULL_MAX_PX
  const quality = size === 'thumb' ? 72 : 88
  return sharp(buf)
    .rotate()
    .resize({
      width: max,
      height: max,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: { r: 255, g: 253, b: 247 } })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()
}

function jpegResponse(buf: Buffer, size: 'thumb' | 'full', cacheSeconds: number) {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(buf.byteLength),
      'Cache-Control': `public, max-age=${cacheSeconds}, stale-while-revalidate=86400`,
      'X-Image-Size': size,
    },
  })
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
  const variant = (url.searchParams.get('variant') || 'studio').toLowerCase()
  const sizeParam = (url.searchParams.get('size') || 'full').toLowerCase()
  const size: 'thumb' | 'full' = sizeParam === 'thumb' ? 'thumb' : 'full'

  if (variant === 'original') {
    return NextResponse.redirect(nkFallbackUrl(itemcode, request.url, size), 302)
  }

  const sb = admin()
  const { data: enr } = await sb
    .from('product_enrichment')
    .select('studio_image_path, detail_image_path, maat_image_path')
    .eq('itemcode', itemcode)
    .maybeSingle()

  let path: string | null = null
  if (variant === 'detail') path = (enr?.detail_image_path as string) || null
  else if (variant === 'maat') path = (enr?.maat_image_path as string) || null
  else path = (enr?.studio_image_path as string) || null

  if (!path) {
    if (variant === 'studio') {
      return NextResponse.redirect(nkFallbackUrl(itemcode, request.url, size), 302)
    }
    return NextResponse.json({ error: `Geen ${variant}-foto` }, { status: 404 })
  }

  // Download + integrity (geen pure redirect meer: thumbs + corruptie-check)
  const { data: file, error: dlErr } = await sb.storage.from(MEDIA_BUCKET).download(path)
  if (dlErr || !file) {
    if (variant === 'studio') {
      return NextResponse.redirect(nkFallbackUrl(itemcode, request.url, size), 302)
    }
    return NextResponse.json(
      { error: `Storage: ${dlErr?.message || 'download mislukt'}` },
      { status: 404 }
    )
  }

  const rawBuf = Buffer.from(await file.arrayBuffer())
  if (!isValidImageMagic(rawBuf)) {
    console.warn(
      `[product-media] corrupt ${path} head=${rawBuf.subarray(0, 4).toString('hex')}`
    )
    // Corrupte studio/set → val terug op NK-origineel
    if (variant === 'studio' || variant === 'detail' || variant === 'maat') {
      return NextResponse.redirect(nkFallbackUrl(itemcode, request.url, size), 302)
    }
    return NextResponse.json({ error: 'Corrupt image' }, { status: 422 })
  }

  try {
    const out = await resizeToJpeg(rawBuf, size)
    // thumbs: 1 dag cache; full: korter (content kan regenereren)
    const cacheSec = size === 'thumb' ? 86400 : 3600
    return jpegResponse(out, size, cacheSec)
  } catch (e) {
    console.error('[product-media] resize failed', e)
    if (variant === 'studio') {
      return NextResponse.redirect(nkFallbackUrl(itemcode, request.url, size), 302)
    }
    return NextResponse.json({ error: 'Resize mislukt' }, { status: 500 })
  }
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
  const bytes = new Uint8Array(buf.byteLength)
  bytes.set(buf)
  const body = new Blob([bytes], { type: mime })
  const { error: upErr } = await sb.storage.from(MEDIA_BUCKET).upload(path, body, {
    contentType: mime,
    upsert: true,
  })
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data: dl, error: dlErr } = await sb.storage.from(MEDIA_BUCKET).download(path)
  if (dlErr || !dl) {
    return NextResponse.json(
      { error: `Upload verify mislukt: ${dlErr?.message || 'geen data'}` },
      { status: 500 }
    )
  }
  const stored = Buffer.from(await dl.arrayBuffer())
  if (!isValidImageMagic(stored)) {
    await sb.storage.from(MEDIA_BUCKET).remove([path])
    return NextResponse.json(
      {
        error: `Bestand corrupt na upload (head ${stored.subarray(0, 4).toString('hex')})`,
      },
      { status: 500 }
    )
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
    url: `/api/product-media/${encodeURIComponent(itemcode)}?variant=studio&size=full&t=${Date.now()}`,
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
