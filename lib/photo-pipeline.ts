/**
 * Studio-fotoset (Vercel-vriendelijk, pure Node):
 *
 *   Nieuwkoop cutout
 *     → warme perzik-beige studio (sharp/raw ≈ build-studio-v2.py)
 *     → Grok Imagine edit
 *     → studio-final + detail + maat (sharp)
 *     → Storage studio/ detail/ maat/
 *
 * Lokaal batch met Python blijft via: npm run optimize-photos
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { MEDIA_BUCKET } from '@/lib/product-media'
import matenByItemcode from '@/scripts/photo-pipeline/maten-by-itemcode.json'

const SIZE = 1024
const DOEL = 2048
const PLANT_FRAC = 0.78
const BASE_FRAC = 0.875

const WALL_TOP: [number, number, number] = [239, 211, 176]
const WALL_MID: [number, number, number] = [246, 222, 189]
const FLOOR_BOT: [number, number, number] = [236, 206, 170]
const VIGNETTE = 0.955
const SHADOW_RGB = { r: 120, g: 88, b: 58 }
const SAGE = 'rgba(122,138,110,0.92)'

const PROMPT = `Re-render this exact image as a professional studio product photograph. CRITICAL: keep the composition IDENTICAL — same square 1:1 format, plant in the exact same position and size, same warm beige background colors, same margins. Do not zoom, crop, move or resize anything. The plant and pot must stay 100% identical: same leaves with the same variegation pattern, same pot shape and texture — this is a real product photo. The floor-wall transition must stay barely visible, very gradual. Lighting: one large soft light source from the upper front-left, giving the plant photographic depth and one very soft, diffuse natural shadow of plant and pot together falling slightly to the right on the floor. No hard shadow edges. Crisp sharp foliage. THE POT: you may light the pot naturally — highlights and soft shading from the light source are welcome — but its texture pattern, material, base color and color temperature must remain exactly as in the input image. Do not smooth, repaint or re-texture the pot and do not let the beige background tint it. Leaf colors must also stay true to the input. No props, no text.`

type MaatEntry = { total: number; pot?: number; diam?: number; l?: number; b?: number }
const MATEN = matenByItemcode as Record<string, MaatEntry>

type StudioMeta = {
  base_frac: number
  pot_w_frac: number
  pot_top_frac?: number
}

export type PhotosetResult = {
  itemcode: string
  studioPath: string
  detailPath: string
  maatPath: string
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** PNG/JPEG magic — vangt stille binary-corruptie (bv. UTF-8 mangling) op. */
function assertImageMagic(buf: Buffer, contentType: string, label: string) {
  if (buf.byteLength < 8) {
    throw new Error(`${label}: bestand te klein (${buf.byteLength} B)`)
  }
  const isPng =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (contentType.includes('png') && !isPng) {
    throw new Error(
      `${label}: geen geldige PNG (head ${buf.subarray(0, 4).toString('hex')})`
    )
  }
  if (
    (contentType.includes('jpeg') || contentType.includes('jpg')) &&
    !isJpeg
  ) {
    throw new Error(
      `${label}: geen geldige JPEG (head ${buf.subarray(0, 4).toString('hex')})`
    )
  }
  if (!contentType.includes('png') && !contentType.includes('jpeg') && !contentType.includes('jpg')) {
    if (!isPng && !isJpeg) {
      throw new Error(
        `${label}: onbekend image-formaat (head ${buf.subarray(0, 4).toString('hex')})`
      )
    }
  }
}

/**
 * Upload binary veilig naar Storage.
 * Gebruikt ArrayBuffer (betrouwbaarder op Vercel dan bare Buffer/Blob).
 * Verifieert via public URL — SDK-download kan stale/corrupt teruggeven.
 */
async function upload(
  sb: ReturnType<typeof admin>,
  path: string,
  buf: Buffer,
  contentType: string
) {
  assertImageMagic(buf, contentType, `upload ${path}`)

  // Verse ArrayBuffer-kopie (niet shared Buffer pool)
  const ab = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer

  // Oude object weg → voorkomt sticky corrupte versies
  await sb.storage.from(MEDIA_BUCKET).remove([path]).catch(() => null)

  const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, ab, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  })
  if (error) throw new Error(`Storage ${path}: ${error.message}`)

  // Verify via public URL (niet SDK download — die gaf soms stale corrupt data)
  const { data: pub } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path)
  const url = `${pub.publicUrl}${pub.publicUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
  let stored: Buffer | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * attempt))
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const body = Buffer.from(await res.arrayBuffer())
      if (body.byteLength === buf.byteLength) {
        try {
          assertImageMagic(body, contentType, `verify ${path}`)
          stored = body
          break
        } catch {
          /* retry */
        }
      }
    } catch {
      /* retry */
    }
  }
  if (!stored) {
    // Fallback: SDK download
    const { data: dl, error: dlErr } = await sb.storage
      .from(MEDIA_BUCKET)
      .download(path)
    if (dlErr || !dl) {
      throw new Error(
        `Storage verify ${path}: mislukt (${dlErr?.message || 'geen data'})`
      )
    }
    stored = Buffer.from(await dl.arrayBuffer())
    assertImageMagic(stored, contentType, `verify ${path}`)
    if (stored.byteLength !== buf.byteLength) {
      throw new Error(
        `Storage corrupt ${path}: size ${stored.byteLength} ≠ ${buf.byteLength}`
      )
    }
  }
}

/** Web-vriendelijke JPEG (veel lichter dan 4–8 MB PNG). */
async function toWebJpeg(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(DOEL, DOEL, {
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function lerp3(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t,
  ]
}

function buildBackgroundRgb(): Buffer {
  const buf = Buffer.alloc(SIZE * SIZE * 3)
  for (let y = 0; y < SIZE; y++) {
    const fy = y / SIZE
    const col =
      fy < 0.5
        ? lerp3(WALL_TOP, WALL_MID, smoothstep(0, 0.5, fy))
        : lerp3(WALL_MID, FLOOR_BOT, smoothstep(0.5, 1.05, fy))
    for (let x = 0; x < SIZE; x++) {
      const fx = x / SIZE
      const d = Math.hypot(fx - 0.5, (fy - 0.55) * 0.9)
      const v = 1 - (1 - VIGNETTE) * smoothstep(0.5, 0.95, d)
      const i = (y * SIZE + x) * 3
      buf[i] = Math.round(col[0] * v)
      buf[i + 1] = Math.round(col[1] * v)
      buf[i + 2] = Math.round(col[2] * v)
    }
  }
  return buf
}

function potMetrics(alpha: Buffer, w: number, h: number) {
  // bbox van hele plant (voor centrering)
  let l = w
  let t = h
  let r = 0
  let b = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > 8) {
        if (x < l) l = x
        if (y < t) t = y
        if (x > r) r = x
        if (y > b) b = y
      }
    }
  }
  if (r < l || b < t) {
    return {
      cx: Math.floor(w / 2),
      plantCx: Math.floor(w / 2),
      potW: Math.floor(w / 3),
    }
  }

  // plant-centrum = midden van volledige silhouette
  const plantCx = Math.floor((l + r) / 2)

  // pot-breedte uit onderste strook (voor schaduw)
  const y0 = Math.max(t, b - Math.max(4, Math.floor((b - t) * 0.04)))
  let xmin = Infinity
  let xmax = -Infinity
  for (let y = y0; y <= b; y++) {
    for (let x = l; x <= r; x++) {
      if (alpha[y * w + x] > 40) {
        if (x < xmin) xmin = x
        if (x > xmax) xmax = x
      }
    }
  }
  if (!Number.isFinite(xmin)) {
    return {
      cx: plantCx,
      plantCx,
      potW: Math.floor((r - l) / 3),
    }
  }
  // cx blijft pot-centrum voor schaduw; plantCx voor horizontale centrering
  return {
    cx: Math.floor((xmin + xmax) / 2),
    plantCx,
    potW: xmax - xmin,
  }
}

/**
 * Hercentreert onderwerp horizontaal op vierkant canvas (na AI kan compositie verschuiven).
 * Achtergrond = warme beige; plant = pixels die genoeg afwijken van hoek-samples.
 */
async function recenterSubject(img: Buffer, size = DOEL): Promise<Buffer> {
  const { data, info } = await sharp(img)
    .resize(size, size, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = info.channels

  // Sample hoeken voor achtergrondkleur
  const samples: number[][] = []
  const corner = (x: number, y: number) => {
    const i = (y * w + x) * ch
    samples.push([data[i], data[i + 1], data[i + 2]])
  }
  for (let d = 2; d < 12; d++) {
    corner(d, d)
    corner(w - 1 - d, d)
    corner(d, h - 1 - d)
    corner(w - 1 - d, h - 1 - d)
  }
  const bg = [0, 0, 0]
  for (const s of samples) {
    bg[0] += s[0]
    bg[1] += s[1]
    bg[2] += s[2]
  }
  bg[0] /= samples.length
  bg[1] /= samples.length
  bg[2] /= samples.length
  const thr = 48 * 48 // squared distance

  let xmin = w
  let xmax = 0
  let ymin = h
  let ymax = 0
  let found = false
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      const dr = data[i] - bg[0]
      const dg = data[i + 1] - bg[1]
      const db = data[i + 2] - bg[2]
      if (dr * dr + dg * dg + db * db > thr) {
        found = true
        if (x < xmin) xmin = x
        if (x > xmax) xmax = x
        if (y < ymin) ymin = y
        if (y > ymax) ymax = y
      }
    }
  }
  if (!found || xmax <= xmin) return sharp(img).resize(size, size).png().toBuffer()

  const contentCx = (xmin + xmax) / 2
  const shiftX = Math.round(w / 2 - contentCx)
  if (Math.abs(shiftX) < 4) {
    return sharp(img).resize(size, size).png().toBuffer()
  }

  // Verschuif op canvas met beige achtergrond
  const bgRgb = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: {
        r: Math.round(bg[0]),
        g: Math.round(bg[1]),
        b: Math.round(bg[2]),
      },
    },
  })
    .png()
    .toBuffer()

  const subject = await sharp(img).resize(size, size).png().toBuffer()
  return sharp(bgRgb)
    .composite([
      {
        input: subject,
        left: shiftX,
        top: 0,
      },
    ])
    .png()
    .toBuffer()
}

function potTopRow(alpha: Buffer, w: number, h: number, potW: number): number | null {
  let runMax = 0
  let minW: number | null = null
  let minY: number | null = null
  for (let y = h - 1; y > Math.floor(h * 0.2); y--) {
    let xMin = Infinity
    let xMax = -Infinity
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > 40) {
        if (x < xMin) xMin = x
        if (x > xMax) xMax = x
      }
    }
    if (!Number.isFinite(xMin)) continue
    const breedte = xMax - xMin
    if (runMax > potW * 0.9) {
      if (breedte < runMax * 0.4) return y
      if (breedte < runMax * 0.92) {
        if (minW === null || breedte < minW) {
          minW = breedte
          minY = y
        }
      }
      if (minW !== null && breedte > minW * 1.3) return minY
    }
    runMax = Math.max(runMax, breedte)
  }
  return null
}

async function prepareCutout(cutoutPng: Buffer) {
  const trimmed = await sharp(cutoutPng)
    .ensureAlpha()
    .trim({ threshold: 8 })
    .modulate({ saturation: 1.04 })
    .linear(1.03, -(128 * 0.03))
    .sharpen({ sigma: 0.8, m1: 0.6, m2: 0.3 })
    .png()
    .toBuffer()

  const meta0 = await sharp(trimmed).metadata()
  const srcH = meta0.height || 1
  const srcW = meta0.width || 1
  const targetH = Math.round(SIZE * PLANT_FRAC)
  const scale = targetH / srcH
  const cutW = Math.max(1, Math.round(srcW * scale))
  const cutH = targetH

  const cutScaled = await sharp(trimmed)
    .resize(cutW, cutH, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .png()
    .toBuffer()

  const { data: cutRaw } = await sharp(cutScaled)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const alpha = Buffer.alloc(cutW * cutH)
  for (let i = 0; i < cutW * cutH; i++) alpha[i] = cutRaw[i * 4 + 3]

  return { cutScaled, alpha, cutW, cutH }
}

async function buildStudioFromCutout(cutoutPng: Buffer): Promise<{
  studioPng: Buffer
  potMaskPng: Buffer | null
  meta: StudioMeta
}> {
  const { cutScaled, alpha, cutW, cutH } = await prepareCutout(cutoutPng)
  const { cx: potCx, plantCx, potW } = potMetrics(alpha, cutW, cutH)
  const baseY = Math.round(SIZE * BASE_FRAC)
  // Centreer hele plant (niet alleen de pot) in het frame
  const pasteX = Math.floor(SIZE / 2 - plantCx)
  const pasteY = baseY - cutH

  const left = Math.max(0, Math.min(SIZE - cutW, pasteX))
  const top = Math.max(0, Math.min(SIZE - cutH, pasteY))
  // potCx nog beschikbaar voor schaduw-offset indien nodig
  void potCx

  const bgRaw = buildBackgroundRgb()
  let bg = await sharp(bgRaw, {
    raw: { width: SIZE, height: SIZE, channels: 3 },
  })
    .png()
    .toBuffer()

  // Zachte contactschaduw + silhouet-ellips
  const ew = Math.round(potW * 1.5)
  const eh = Math.max(14, Math.round(ew * 0.18))
  const cx = SIZE / 2
  const shadowSvg = Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="b" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="20"/>
        </filter>
      </defs>
      <ellipse cx="${cx + 14}" cy="${baseY - 8}" rx="${Math.round(ew * 0.6)}" ry="${Math.round(eh * 2.2)}"
        fill="rgb(${SHADOW_RGB.r},${SHADOW_RGB.g},${SHADOW_RGB.b})" opacity="0.20" filter="url(#b)"/>
      <ellipse cx="${cx}" cy="${baseY}" rx="${Math.round(ew / 2)}" ry="${Math.round(eh / 2)}"
        fill="rgb(${SHADOW_RGB.r},${SHADOW_RGB.g},${SHADOW_RGB.b})" opacity="0.38" filter="url(#b)"/>
    </svg>
  `)

  bg = await sharp(bg)
    .composite([{ input: shadowSvg, top: 0, left: 0 }])
    .png()
    .toBuffer()

  const studioPng = await sharp(bg)
    .composite([{ input: cutScaled, left, top }])
    .png()
    .toBuffer()

  const pt = potTopRow(alpha, cutW, cutH, potW)
  const meta: StudioMeta = {
    base_frac: BASE_FRAC,
    pot_w_frac: potW / SIZE,
  }
  if (pt !== null) {
    const frac = (pasteY + pt) / SIZE
    const pothoogte = BASE_FRAC - frac
    if (pothoogte > 0.06 && pothoogte < 0.55) meta.pot_top_frac = frac
  }

  let potMaskPng: Buffer | null = null
  if (meta.pot_top_frac != null && pt !== null) {
    const potAlpha = Buffer.from(alpha)
    for (let y = 0; y < Math.max(0, pt - 4); y++) {
      potAlpha.fill(0, y * cutW, (y + 1) * cutW)
    }
    const potRgba = Buffer.alloc(cutW * cutH * 4)
    for (let i = 0; i < cutW * cutH; i++) {
      potRgba[i * 4] = 255
      potRgba[i * 4 + 1] = 255
      potRgba[i * 4 + 2] = 255
      potRgba[i * 4 + 3] = potAlpha[i]
    }
    const potMaskLocal = await sharp(potRgba, {
      raw: { width: cutW, height: cutH, channels: 4 },
    })
      .blur(1.5)
      .png()
      .toBuffer()

    potMaskPng = await sharp({
      create: {
        width: SIZE,
        height: SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: potMaskLocal, left, top }])
      .png()
      .toBuffer()
  }

  return { studioPng, potMaskPng, meta }
}

async function fetchNieuwkoopCutout(code: string): Promise<Buffer> {
  const base = process.env.NIEUWKOOP_API_BASE_URL?.replace(/\/$/, '')
  const user = process.env.NIEUWKOOP_API_USER
  const pass = process.env.NIEUWKOOP_API_PASSWORD
  if (!base || !user || !pass) throw new Error('NIEUWKOOP_API_* ontbreekt')

  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
  const r = await fetch(`${base}/items/${encodeURIComponent(code)}/image`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`Nieuwkoop ${code}: HTTP ${r.status}`)
  const j = (await r.json()) as { Image?: string; image?: string }
  const b64 = String(j.Image || j.image || '').replace(/^data:image\/[a-z]+;base64,/i, '')
  if (!b64) throw new Error(`Nieuwkoop ${code}: geen Image-veld`)
  return Buffer.from(b64, 'base64')
}

async function aiEditGrok(inputPng: Buffer): Promise<Buffer> {
  const key = process.env.XAI_API_KEY
  if (!key) throw new Error('XAI_API_KEY ontbreekt (Grok Imagine)')

  const model = process.env.AI_MODEL || 'grok-imagine-image-quality'
  const resolution = (process.env.AI_RESOLUTION || '1k') === '2k' ? '2k' : '1k'

  const r = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt: PROMPT,
      image: { url: `data:image/png;base64,${inputPng.toString('base64')}`, type: 'image_url' },
      aspect_ratio: '1:1',
      resolution,
      response_format: 'b64_json',
    }),
  })
  const text = await r.text()
  let d: {
    error?: { message?: string }
    message?: string
    data?: Array<{ b64_json?: string; url?: string }>
    url?: string
  }
  try {
    d = JSON.parse(text)
  } catch {
    throw new Error(`Grok HTTP ${r.status}: ${text.slice(0, 200)}`)
  }
  if (!r.ok || d.error) {
    throw new Error(d.error?.message || d.message || `Grok ${r.status}`)
  }
  const item = d.data?.[0]
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
  const url = item?.url || d.url
  if (url) {
    const img = await fetch(url)
    if (!img.ok) throw new Error(`Grok download HTTP ${img.status}`)
    return Buffer.from(await img.arrayBuffer())
  }
  throw new Error('Grok: geen b64_json/url')
}

/** Waar potmasker opaque is: originele pot (basis) over AI leggen. */
async function restorePot(
  aiPng: Buffer,
  basisPng: Buffer,
  potMaskPng: Buffer | null
): Promise<Buffer> {
  if (!potMaskPng) return aiPng

  const sizeMeta = await sharp(aiPng).metadata()
  const W = sizeMeta.width || SIZE
  const H = sizeMeta.height || SIZE

  const { data: ai } = await sharp(aiPng)
    .resize(W, H)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { data: basis } = await sharp(basisPng)
    .resize(W, H)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { data: mask } = await sharp(potMaskPng)
    .resize(W, H)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const m = mask[i * 4 + 3] / 255
    const o = i * 4
    out[o] = Math.round(basis[o] * m + ai[o] * (1 - m))
    out[o + 1] = Math.round(basis[o + 1] * m + ai[o + 1] * (1 - m))
    out[o + 2] = Math.round(basis[o + 2] * m + ai[o + 2] * (1 - m))
    out[o + 3] = 255
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
}

async function makeDetail(hqPng: Buffer, meta: StudioMeta): Promise<Buffer> {
  const metaImg = await sharp(hqPng).metadata()
  const S = metaImg.width || DOEL
  const top = Math.round(S * (meta.base_frac - PLANT_FRAC))
  const onder = Math.round(S * (meta.pot_top_frac ?? meta.base_frac - 0.25))
  const zijde = Math.min(
    Math.round(S * 0.5),
    Math.max(Math.round(S * 0.3), onder - top)
  )
  const y0 = Math.max(0, top + Math.floor((onder - top - zijde) / 2))
  const x0 = Math.floor(S / 2 - zijde / 2)
  const safe = Math.min(zijde, S - Math.max(0, x0), S - Math.max(0, y0))

  return sharp(hqPng)
    .extract({
      left: Math.max(0, x0),
      top: Math.max(0, y0),
      width: Math.max(1, safe),
      height: Math.max(1, safe),
    })
    .resize(DOEL, DOEL, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.9, m1: 0.5, m2: 0.3 })
    .png()
    .toBuffer()
}

function maatSvg(S: number, m: MaatEntry, meta: StudioMeta): Buffer | null {
  if (!m?.total || !Number.isFinite(m.total) || m.total <= 0) return null

  const baseY = Math.round(S * (meta.base_frac ?? BASE_FRAC))
  const topY = baseY - Math.round(S * PLANT_FRAC)
  const cmPx = (S * PLANT_FRAC) / m.total
  const lw = Math.max(4, Math.round(S / 400))
  const fs = Math.max(28, Math.round(S * 0.028))
  const parts: string[] = []
  // lichte stroke-achtergrond voor leesbaarheid op beige
  const label = (txt: string, x: number, y: number, anchor = 'end') =>
    `<text x="${x}" y="${y}" fill="${SAGE}" stroke="rgba(255,253,247,0.85)" stroke-width="${Math.max(3, lw)}" paint-order="stroke" font-size="${fs}" font-weight="600" font-family="Helvetica, Arial, sans-serif" text-anchor="${anchor}" dominant-baseline="middle">${txt}</text>`

  const x = Math.round(S * 0.915)
  parts.push(
    `<line x1="${x}" y1="${baseY}" x2="${x}" y2="${topY}" stroke="${SAGE}" stroke-width="${lw}"/>`,
    `<line x1="${x - 5 * lw}" y1="${baseY}" x2="${x + 5 * lw}" y2="${baseY}" stroke="${SAGE}" stroke-width="${lw}"/>`,
    `<line x1="${x - 5 * lw}" y1="${topY}" x2="${x + 5 * lw}" y2="${topY}" stroke="${SAGE}" stroke-width="${lw}"/>`,
    label(`${Math.round(m.total)} cm`, x - 12, Math.round((baseY + topY) / 2), 'end')
  )

  if (m.pot) {
    const xp = Math.round(S * 0.085)
    const potTop =
      meta.pot_top_frac != null
        ? Math.round(S * meta.pot_top_frac)
        : baseY - Math.round(m.pot * cmPx)
    parts.push(
      `<line x1="${xp}" y1="${baseY}" x2="${xp}" y2="${potTop}" stroke="${SAGE}" stroke-width="${lw}"/>`,
      `<line x1="${xp - 5 * lw}" y1="${baseY}" x2="${xp + 5 * lw}" y2="${baseY}" stroke="${SAGE}" stroke-width="${lw}"/>`,
      `<line x1="${xp - 5 * lw}" y1="${potTop}" x2="${xp + 5 * lw}" y2="${potTop}" stroke="${SAGE}" stroke-width="${lw}"/>`,
      label(`${Math.round(m.pot)} cm`, xp + 12, Math.round((baseY + potTop) / 2), 'start')
    )
  }

  let onderlbl: string | null = null
  let onderCm: number | null = null
  if (m.diam) {
    onderlbl = `Ø ${Math.round(m.diam)} cm`
    onderCm = m.diam
  } else if (m.l) {
    onderCm = m.l
    onderlbl = m.b
      ? `${Math.round(m.l)} × ${Math.round(m.b)} cm`
      : `${Math.round(m.l)} cm`
  }
  if (onderlbl && onderCm) {
    const yb = Math.round(S * 0.952)
    const half = Math.round((onderCm * cmPx) / 2)
    parts.push(
      `<line x1="${S / 2 - half}" y1="${yb}" x2="${S / 2 + half}" y2="${yb}" stroke="${SAGE}" stroke-width="${lw}"/>`,
      `<line x1="${S / 2 - half}" y1="${yb - 5 * lw}" x2="${S / 2 - half}" y2="${yb + 5 * lw}" stroke="${SAGE}" stroke-width="${lw}"/>`,
      `<line x1="${S / 2 + half}" y1="${yb - 5 * lw}" x2="${S / 2 + half}" y2="${yb + 5 * lw}" stroke="${SAGE}" stroke-width="${lw}"/>`,
      label(onderlbl, S / 2, yb + Math.round(S * 0.028), 'middle')
    )
  }

  return Buffer.from(
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
  )
}

/** Maten uit JSON-map, anders height/diameter/width/pot uit nieuwkoop_products. */
async function resolveMaatEntry(
  sb: ReturnType<typeof admin>,
  code: string
): Promise<MaatEntry | null> {
  const fromJson = MATEN[code]
  if (fromJson?.total && Number.isFinite(fromJson.total) && fromJson.total > 0) {
    return fromJson
  }

  const { data } = await sb
    .from('nieuwkoop_products')
    .select('height, diameter, length, width, height_culture_pot, pot_size')
    .eq('itemcode', code)
    .maybeSingle()

  if (!data) return null
  const total = Number(data.height)
  if (!Number.isFinite(total) || total <= 0) return null

  const entry: MaatEntry = { total }
  const diam = Number(data.diameter)
  if (Number.isFinite(diam) && diam > 0) entry.diam = diam
  const pot = Number(data.height_culture_pot)
  if (Number.isFinite(pot) && pot > 0) entry.pot = pot
  const l = Number(data.length)
  const w = Number(data.width)
  // Breedte als plantdiameter als diameter ontbreekt (vaak zo bij hydro/planten)
  if (!entry.diam && Number.isFinite(w) && w > 0) {
    entry.diam = w
  }
  if (!entry.diam && Number.isFinite(l) && l > 0) {
    entry.l = l
    if (Number.isFinite(w) && w > 0) entry.b = w
  }
  // pot_size tekst "19" of "Ø 19" → pot-hoogte als die nog ontbreekt
  if (!entry.pot && data.pot_size) {
    const m = String(data.pot_size).match(/(\d+(?:[.,]\d+)?)/)
    if (m) {
      const n = Number(m[1].replace(',', '.'))
      if (Number.isFinite(n) && n > 0 && n < total) entry.pot = n
    }
  }
  return entry
}

async function makeMaat(
  studioPng: Buffer,
  maat: MaatEntry | null,
  meta: StudioMeta
): Promise<Buffer> {
  const svg = maat ? maatSvg(DOEL, maat, meta) : null
  if (!svg) {
    return sharp(studioPng).resize(DOEL, DOEL).png().toBuffer()
  }
  return sharp(studioPng)
    .resize(DOEL, DOEL)
    .composite([{ input: svg, top: 0, left: 0 }])
    .png()
    .toBuffer()
}

/**
 * Volledige set voor één itemcode — Node/sharp + Grok (werkt op Vercel).
 */
export async function generatePhotosetForItem(itemcode: string): Promise<PhotosetResult> {
  const code = itemcode.trim().toUpperCase()

  if (!process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY ontbreekt (Grok Imagine)')
  }
  if (!process.env.NIEUWKOOP_API_BASE_URL) {
    throw new Error('NIEUWKOOP_API_* ontbreekt')
  }

  console.log(`[photo-pipeline] ${code}: cutout…`)
  const cutout = await fetchNieuwkoopCutout(code)

  console.log(`[photo-pipeline] ${code}: studio-basis…`)
  const { studioPng, potMaskPng, meta } = await buildStudioFromCutout(cutout)

  console.log(`[photo-pipeline] ${code}: Grok Imagine…`)
  let aiPng = await aiEditGrok(studioPng)

  try {
    aiPng = await restorePot(aiPng, studioPng, potMaskPng)
  } catch (e) {
    console.warn('[photo-pipeline] pot-restore skipped', e)
  }

  // Na AI opnieuw horizontaal centreren (Grok kan plant verschuiven)
  try {
    aiPng = await recenterSubject(aiPng, DOEL)
  } catch (e) {
    console.warn('[photo-pipeline] recenter skipped', e)
  }

  const studioFinal = await sharp(aiPng)
    .resize(DOEL, DOEL, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.1, m1: 0.65, m2: 0.35 })
    .png()
    .toBuffer()

  const sb = admin()
  const maatEntry = await resolveMaatEntry(sb, code)
  if (!maatEntry) {
    console.warn(`[photo-pipeline] ${code}: geen maten (JSON noch DB) — maat = studio`)
  } else {
    console.log(
      `[photo-pipeline] ${code}: maten total=${maatEntry.total}` +
        (maatEntry.pot ? ` pot=${maatEntry.pot}` : '') +
        (maatEntry.diam ? ` diam=${maatEntry.diam}` : '')
    )
  }

  console.log(`[photo-pipeline] ${code}: detail + maat…`)
  const detailPng = await makeDetail(studioFinal, meta)
  const maatPng = await makeMaat(studioFinal, maatEntry, meta)

  // Web-JPEG: sneller laden + minder storage (i.p.v. 4–8 MB PNG)
  const studioJpeg = await toWebJpeg(studioFinal)
  const detailJpeg = await toWebJpeg(detailPng)
  const maatJpeg = await toWebJpeg(maatPng)

  const studioPath = `studio/${code}.jpg`
  const detailPath = `detail/${code}.jpg`
  const maatPath = `maat/${code}.jpg`

  await upload(sb, studioPath, studioJpeg, 'image/jpeg')
  await upload(sb, detailPath, detailJpeg, 'image/jpeg')
  await upload(sb, maatPath, maatJpeg, 'image/jpeg')

  // Oude .png-paden opruimen als die er nog hangen
  const stale = [
    `studio/${code}.png`,
    `detail/${code}.png`,
    `maat/${code}.png`,
  ]
  await sb.storage.from(MEDIA_BUCKET).remove(stale).catch(() => null)

  const now = new Date().toISOString()
  const { error } = await sb.from('product_enrichment').upsert(
    {
      itemcode: code,
      studio_image_path: studioPath,
      detail_image_path: detailPath,
      maat_image_path: maatPath,
      photoset_generated_at: now,
      updated_at: now,
    },
    { onConflict: 'itemcode' }
  )
  if (error) throw new Error(`enrichment: ${error.message}`)

  console.log(
    `[photo-pipeline] ${code}: klaar (studio ${Math.round(studioJpeg.byteLength / 1024)} KB, detail ${Math.round(detailJpeg.byteLength / 1024)} KB, maat ${Math.round(maatJpeg.byteLength / 1024)} KB)`
  )
  return { itemcode: code, studioPath, detailPath, maatPath }
}
