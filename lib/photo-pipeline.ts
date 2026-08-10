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

import fs from 'fs'
import path from 'path'
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
/** Stera Pro brand — maat-overlay tekst & lijnen */
const STERA_GREEN = '#426F52'

const PROMPT = `Re-render this exact image as a professional studio product photograph. CRITICAL: keep the composition IDENTICAL — same square 1:1 format, plant in the exact same position and size, same warm beige background colors, same margins. Do not zoom, crop, move or resize anything. The plant and pot must stay 100% identical: same leaves with the same variegation pattern, same pot shape and texture — this is a real product photo. The floor-wall transition must stay barely visible, very gradual. Lighting: one large soft light source from the upper front-left, giving the plant photographic depth and one very soft, diffuse natural shadow of plant and pot together falling slightly to the right on the floor. No hard shadow edges. Crisp sharp foliage. THE POT: you may light the pot naturally — highlights and soft shading from the light source are welcome — but its texture pattern, material, base color and color temperature must remain exactly as in the input image. Do not smooth, repaint or re-texture the pot and do not let the beige background tint it. Leaf colors must also stay true to the input. No props, no text.`

/** Extra instructie voor hangplanten — pot hangt bovenaan, bladeren vallen naar beneden. */
const PROMPT_HANGING = `Re-render this exact image as a professional studio product photograph of a HANGING plant. CRITICAL: keep the composition IDENTICAL — same square 1:1 format, plant in the exact same position and size, same warm beige background colors, same margins. Do not zoom, crop, move or resize anything. The plant MUST look suspended from above: the pot or hanging basket stays near the TOP of the frame; foliage trails and cascades DOWNWARD. Do NOT place the pot on the floor. The plant and pot must stay 100% identical: same leaves with the same variegation pattern, same pot shape and texture — this is a real product photo. Soft ambient studio lighting from upper front-left; one very soft diffuse shadow of the trailing foliage falling slightly downward/right on the background — no hard floor contact shadow under a standing pot. Crisp sharp foliage. THE POT: may receive natural highlights but texture, material and color must remain exactly as in the input. No props, no extra chains or hooks unless already in the input, no text.`

type MaatEntry = { total: number; pot?: number; diam?: number; l?: number; b?: number }
const MATEN = matenByItemcode as Record<string, MaatEntry>

type StudioMeta = {
  base_frac: number
  pot_w_frac: number
  pot_top_frac?: number
  /** true = hangplant: pot bovenaan, bladeren hangend */
  hanging?: boolean
}

/** Top-marge voor hangplant (ophangpunt / pot bovenaan). */
const HANG_TOP_FRAC = 0.07
const HANG_PLANT_FRAC = 0.84

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
 *
 * BELANGRIJK: NOOIT bare ArrayBuffer/SharedArrayBuffer doorgeven — supabase-js
 * kan die omzetten naar de string "[object SharedArrayBuffer]" (26 bytes).
 * Wel: verse Uint8Array-kopie (werkt op Vercel + lokaal).
 */
async function upload(
  sb: ReturnType<typeof admin>,
  path: string,
  buf: Buffer,
  contentType: string
) {
  assertImageMagic(buf, contentType, `upload ${path}`)

  // Eigen kopie — geen shared underlying buffer
  const bytes = new Uint8Array(buf.byteLength)
  bytes.set(buf)

  await sb.storage.from(MEDIA_BUCKET).remove([path]).catch(() => null)

  const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
    // Korte CDN-cache: content wordt hergebruikt onder hetzelfde pad na regeneratie
    cacheControl: '60',
  })
  if (error) throw new Error(`Storage ${path}: ${error.message}`)

  // Verify via public URL
  const { data: pub } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path)
  const url = `${pub.publicUrl}${pub.publicUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
  let stored: Buffer | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 200 * attempt))
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const body = Buffer.from(await res.arrayBuffer())
      // Weiger de bekende stringificatie-fout
      if (
        body.byteLength < 100 ||
        body.toString('utf8', 0, 10).startsWith('[object')
      ) {
        continue
      }
      try {
        assertImageMagic(body, contentType, `verify ${path}`)
        stored = body
        break
      } catch {
        /* retry */
      }
    } catch {
      /* retry */
    }
  }
  if (!stored) {
    const { data: dl, error: dlErr } = await sb.storage
      .from(MEDIA_BUCKET)
      .download(path)
    if (dlErr || !dl) {
      throw new Error(
        `Storage verify ${path}: mislukt (${dlErr?.message || 'geen data'})`
      )
    }
    stored = Buffer.from(await dl.arrayBuffer())
    if (
      stored.byteLength < 100 ||
      stored.toString('utf8', 0, 10).startsWith('[object')
    ) {
      throw new Error(
        `Storage corrupt ${path}: body is stringified object (geen binary image)`
      )
    }
    assertImageMagic(stored, contentType, `verify ${path}`)
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

/**
 * Is dit een hangplant volgens Nieuwkoop-specs?
 * - item_variety_nl: "Hanger", "Hangplant", …
 * - PlantShape-tag: Hang / Ranker / Retombante
 * - beschrijving: hangplant / hanger / hanging / ampel
 */
export function detectIsHanger(row: {
  item_variety_nl?: string | null
  description?: string | null
  tags?: unknown
}): boolean {
  const variety = (row.item_variety_nl || '').toLowerCase()
  if (/\bhangers?\b|\bhangplant\b|\bhanging\b|\bampel/.test(variety)) return true

  const desc = (row.description || '').toLowerCase()
  if (
    /\bhangplant\b|\bhanger\b|\bhanging\s+plant\b|\bampelplant\b|\bhanging\b/.test(
      desc
    )
  ) {
    return true
  }

  if (Array.isArray(row.tags)) {
    type Tag = {
      Code?: string
      Values?: Array<{ Description_NL?: string | null; Description_EN?: string | null }>
    }
    const shape = (row.tags as Tag[]).find((t) => t?.Code === 'PlantShape')
    for (const v of shape?.Values ?? []) {
      const s = `${v.Description_NL || ''} ${v.Description_EN || ''}`.toLowerCase()
      // NK: NL "Hang", EN "Hang", DE "Ranker", FR "Retombante"
      if (/\bhang\b|\branker\b|\bretomb|\bampel|\btrailing\b/.test(s)) return true
    }
  }
  return false
}

async function prepareCutout(cutoutPng: Buffer, plantFrac = PLANT_FRAC) {
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
  const targetH = Math.round(SIZE * plantFrac)
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

/**
 * Pot-onderkant bij hangplanten: pot zit bovenaan de cutout.
 * Scan van boven naar beneden tot de silhouet plots smaller wordt (overgang pot → bladeren).
 */
function hangPotBottomRow(
  alpha: Buffer,
  w: number,
  h: number,
  potW: number
): number | null {
  let runMax = 0
  let minW: number | null = null
  let minY: number | null = null
  const yMax = Math.floor(h * 0.55)
  for (let y = 0; y < yMax; y++) {
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
    if (runMax > potW * 0.85) {
      if (breedte < runMax * 0.45) return y
      if (breedte < runMax * 0.92) {
        if (minW === null || breedte < minW) {
          minW = breedte
          minY = y
        }
      }
      if (minW !== null && breedte > minW * 1.35) return minY
    }
    runMax = Math.max(runMax, breedte)
  }
  return minY
}

async function buildStudioFromCutout(
  cutoutPng: Buffer,
  opts: { hanging?: boolean } = {}
): Promise<{
  studioPng: Buffer
  potMaskPng: Buffer | null
  meta: StudioMeta
}> {
  const hanging = !!opts.hanging
  const plantFrac = hanging ? HANG_PLANT_FRAC : PLANT_FRAC
  const { cutScaled, alpha, cutW, cutH } = await prepareCutout(cutoutPng, plantFrac)
  const { cx: potCx, plantCx, potW } = potMetrics(alpha, cutW, cutH)
  void potCx

  // Staande plant: pot op de vloer. Hangplant: pot/ophangpunt bovenaan.
  const baseY = Math.round(SIZE * BASE_FRAC)
  const pasteX = Math.floor(SIZE / 2 - plantCx)
  const pasteY = hanging
    ? Math.round(SIZE * HANG_TOP_FRAC)
    : baseY - cutH

  const left = Math.max(0, Math.min(SIZE - cutW, pasteX))
  const top = Math.max(0, Math.min(SIZE - cutH, pasteY))

  const bgRaw = buildBackgroundRgb()
  let bg = await sharp(bgRaw, {
    raw: { width: SIZE, height: SIZE, channels: 3 },
  })
    .png()
    .toBuffer()

  const cx = SIZE / 2
  const ew = Math.round(potW * 1.5)
  const eh = Math.max(14, Math.round(ew * 0.18))

  // Schaduw: staand = contact op de vloer; hangend = zachte schaduw onder hangende massa
  const shadowSvg = hanging
    ? Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="b" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="28"/>
        </filter>
      </defs>
      <ellipse cx="${cx + 10}" cy="${Math.min(SIZE - 40, top + Math.round(cutH * 0.72))}"
        rx="${Math.round(ew * 0.75)}" ry="${Math.round(eh * 3.2)}"
        fill="rgb(${SHADOW_RGB.r},${SHADOW_RGB.g},${SHADOW_RGB.b})" opacity="0.16" filter="url(#b)"/>
      <ellipse cx="${cx}" cy="${Math.min(SIZE - 24, top + Math.round(cutH * 0.88))}"
        rx="${Math.round(ew * 0.45)}" ry="${Math.round(eh * 1.6)}"
        fill="rgb(${SHADOW_RGB.r},${SHADOW_RGB.g},${SHADOW_RGB.b})" opacity="0.12" filter="url(#b)"/>
    </svg>
  `)
    : Buffer.from(`
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

  const meta: StudioMeta = {
    base_frac: hanging
      ? Math.min(0.96, (top + cutH) / SIZE)
      : BASE_FRAC,
    pot_w_frac: potW / SIZE,
    hanging,
  }

  // Pot-masker: staand van onder; hangend van boven (pot bovenaan)
  let potMaskPng: Buffer | null = null
  let potEdgeRow: number | null = null

  if (hanging) {
    potEdgeRow = hangPotBottomRow(alpha, cutW, cutH, potW)
    if (potEdgeRow !== null) {
      // pot_top_frac = onderkant van hangpot (waar bladeren beginnen)
      const frac = (top + potEdgeRow) / SIZE
      if (frac > HANG_TOP_FRAC + 0.02 && frac < 0.55) meta.pot_top_frac = frac
    }
  } else {
    potEdgeRow = potTopRow(alpha, cutW, cutH, potW)
    if (potEdgeRow !== null) {
      const frac = (pasteY + potEdgeRow) / SIZE
      const pothoogte = BASE_FRAC - frac
      if (pothoogte > 0.06 && pothoogte < 0.55) meta.pot_top_frac = frac
    }
  }

  if (potEdgeRow !== null && meta.pot_top_frac != null) {
    const potAlpha = Buffer.from(alpha)
    if (hanging) {
      // maskeer alles ONDER de pot-onderkant (alleen pot blijft)
      for (let y = potEdgeRow + 4; y < cutH; y++) {
        potAlpha.fill(0, y * cutW, (y + 1) * cutW)
      }
    } else {
      for (let y = 0; y < Math.max(0, potEdgeRow - 4); y++) {
        potAlpha.fill(0, y * cutW, (y + 1) * cutW)
      }
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

async function aiEditGrok(
  inputPng: Buffer,
  opts: { hanging?: boolean } = {}
): Promise<Buffer> {
  const key = process.env.XAI_API_KEY
  if (!key) throw new Error('XAI_API_KEY ontbreekt (Grok Imagine)')

  const model = process.env.AI_MODEL || 'grok-imagine-image-quality'
  const resolution = (process.env.AI_RESOLUTION || '1k') === '2k' ? '2k' : '1k'
  const prompt = opts.hanging ? PROMPT_HANGING : PROMPT

  const r = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt,
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

/**
 * Detailcrop: strak op de bladmassa / bovenkant van de plant.
 * Vroeger: verticaal gecentreerd tussen planttop en potrand → te veel pot/stam.
 * Nu: verankerd aan de top van de plant, horizontaal op de silhouet, zodat
 * bladeren mooi vullen.
 */
async function makeDetail(hqPng: Buffer, meta: StudioMeta): Promise<Buffer> {
  const metaImg = await sharp(hqPng).metadata()
  const S = metaImg.width || DOEL

  // Fallback op compositie-meta (pre-AI)
  let plantTop = Math.round(S * ((meta.base_frac ?? BASE_FRAC) - PLANT_FRAC))
  let potTop = Math.round(
    S * (meta.pot_top_frac ?? (meta.base_frac ?? BASE_FRAC) - 0.25)
  )
  let plantLeft = Math.round(S * 0.22)
  let plantRight = Math.round(S * 0.78)
  let plantBottom = Math.round(S * (meta.base_frac ?? BASE_FRAC))

  // Na AI: echte silhouet gebruiken (plant kan licht verschoven zijn)
  try {
    const bounds = await detectSubjectBounds(hqPng, S)
    if (bounds) {
      plantTop = bounds.ymin
      plantBottom = bounds.ymax
      plantLeft = bounds.xmin
      plantRight = bounds.xmax
      if (meta.pot_top_frac != null) {
        const metaPot = Math.round(S * meta.pot_top_frac)
        // alleen gebruiken als die binnen de silhouet valt
        if (metaPot > plantTop + 8 && metaPot < plantBottom - 4) {
          potTop = metaPot
        } else {
          // ~55% van silhouet-hoogte ≈ overgang bladeren → pot
          potTop = Math.round(plantTop + (plantBottom - plantTop) * 0.55)
        }
      } else {
        potTop = Math.round(plantTop + (plantBottom - plantTop) * 0.55)
      }
    }
  } catch {
    /* meta-fallback */
  }

  // Bladzone
  // - Staand: van planttop tot potrand (bovenkant)
  // - Hangend: pot zit bovenaan → focus op hangende bladeren ONDER de pot
  let leafTop: number
  let leafBottom: number
  if (meta.hanging) {
    // potTop meta = onderkant hangpot; bladeren daaronder
    leafTop = Math.min(plantBottom - 8, Math.max(plantTop, potTop))
    leafBottom = Math.min(
      plantBottom,
      Math.round(leafTop + (plantBottom - leafTop) * 0.72)
    )
  } else {
    leafTop = plantTop
    leafBottom = Math.max(
      plantTop + Math.round(S * 0.18),
      Math.min(potTop, Math.round(plantTop + (plantBottom - plantTop) * 0.58))
    )
  }
  const leafH = Math.max(1, leafBottom - leafTop)
  const leafW = Math.max(1, plantRight - plantLeft)
  const leafCx = Math.round((plantLeft + plantRight) / 2)

  // Vierkante crop: vult de bladzone, iets ruimer horizontaal voor uitwaaierende bladeren
  let zijde = Math.round(
    Math.min(
      S * 0.56,
      Math.max(S * 0.34, leafH * 0.98, leafW * 0.95)
    )
  )
  zijde = Math.min(zijde, S)

  // Verticaal: vast aan de TOP van de bladzone (+ lichte ademruimte)
  const padTop = Math.round(S * 0.018)
  let y0 = Math.max(0, leafTop - padTop)
  const maxBottom = Math.min(
    S,
    meta.hanging
      ? leafBottom + Math.round(S * 0.06)
      : potTop + Math.round(S * 0.04)
  )
  if (y0 + zijde > maxBottom) {
    y0 = Math.max(0, maxBottom - zijde)
  }
  if (y0 > leafTop - padTop) {
    y0 = Math.max(0, leafTop - padTop)
    zijde = Math.min(zijde, S - y0)
  }
  if (y0 + zijde > S) {
    y0 = Math.max(0, S - zijde)
  }

  // Horizontaal: centrum van de plant-silhouet
  let x0 = Math.round(leafCx - zijde / 2)
  if (x0 < 0) x0 = 0
  if (x0 + zijde > S) x0 = Math.max(0, S - zijde)

  const width = Math.max(1, Math.min(zijde, S - x0))
  const height = Math.max(1, Math.min(zijde, S - y0))
  // Houd vierkant (extract eist width/height; bij rand neem kleinste)
  const side = Math.min(width, height)

  return sharp(hqPng)
    .extract({
      left: x0,
      top: y0,
      width: side,
      height: side,
    })
    .resize(DOEL, DOEL, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.9, m1: 0.5, m2: 0.3 })
    .png()
    .toBuffer()
}

/** Layout van plant + pot op de studiofoto (voor maat-balken). */
type PlantLayout = {
  /** Top van bladeren / kroon */
  plantTop: number
  /** Onderkant pot (niet schaduw) */
  potBottom: number
  /** Bovenrand pot (rim) — alleen betrouwbaar als potOk */
  potRim: number
  potOk: boolean
  xmin: number
  xmax: number
  potXmin: number
  potXmax: number
}

function satLum(R: number, G: number, B: number) {
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const sat = max === 0 ? 0 : (max - min) / max
  const lum = 0.3 * R + 0.59 * G + 0.11 * B
  return { sat, lum }
}

/** Warme studio-beige (muur/vloer) — mag nooit als plant tellen. */
function isStudioBg(R: number, G: number, B: number): boolean {
  const { sat, lum } = satLum(R, G, B)
  if (
    lum > 145 &&
    sat < 0.42 &&
    R > 155 &&
    G > 125 &&
    B > 95 &&
    R >= G - 5 &&
    G >= B - 15 &&
    R - B < 90
  ) {
    return true
  }
  if (lum > 125 && sat < 0.22 && R > 140 && G > 120) return true
  return false
}

function isPlantPx(R: number, G: number, B: number): boolean {
  if (isStudioBg(R, G, B)) return false
  const { sat, lum } = satLum(R, G, B)
  if (sat < 0.09) return false
  // groen / olijf
  if (G > 45) {
    const greenDom = G - Math.min(R, B)
    if (G >= R - 5 && G >= B - 5 && greenDom > 12 && sat > 0.12) return true
    if (G > R && G > B && greenDom > 8 && sat > 0.16) return true
  }
  // blauw / paars (bloemen)
  if (B > 80 && B > R + 18 && B >= G - 5 && sat > 0.18) return true
  // roze / coral stelen (niet beige)
  if (
    R > G + 40 &&
    R > B + 25 &&
    G < 165 &&
    sat > 0.22 &&
    lum > 50 &&
    lum < 190
  ) {
    return true
  }
  // geel-groene variegatie
  if (
    G > 95 &&
    R > 80 &&
    B < G - 18 &&
    sat > 0.16 &&
    Math.abs(R - G) < 60
  ) {
    return true
  }
  // houten stam (bolboom)
  if (
    lum > 50 &&
    lum < 140 &&
    R > G + 10 &&
    G > B + 5 &&
    sat > 0.15 &&
    sat < 0.55 &&
    R < 180
  ) {
    return true
  }
  return false
}

function isPotPx(R: number, G: number, B: number): boolean {
  if (isStudioBg(R, G, B)) return false
  const { sat, lum } = satLum(R, G, B)
  // donkere bladeren ≠ pot
  if (G > R + 10 && G > B + 6) return false
  // zwarte / navy cultuurpot
  if (lum < 92 && sat < 0.55) return true
  // terracotta
  if (lum > 55 && lum < 145 && R > G + 22 && R > B + 28 && sat > 0.2) return true
  return false
}

function isSoilPx(R: number, G: number, B: number): boolean {
  if (isStudioBg(R, G, B)) return false
  const { sat, lum } = satLum(R, G, B)
  return (
    lum > 40 &&
    lum < 125 &&
    R > G + 8 &&
    R > B + 10 &&
    sat > 0.15 &&
    sat < 0.7
  )
}

/**
 * Detecteer plant-top, pot-bodem en pot-rand op de studiofoto.
 *
 * Gebruikt absolute kleurklassen i.p.v. “verschil met hoek-BG”:
 * studio-vignette maakt het midden lichter dan de randen, wat de oude
 * methode de hele canvas als foreground liet zien → balken tot aan de
 * beeldrand.
 */
async function detectPlantLayout(
  img: Buffer,
  size = DOEL
): Promise<PlantLayout | null> {
  const { data, info } = await sharp(img)
    .resize(size, size, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = info.channels

  const xL = Math.floor(w * 0.1)
  const xR = Math.floor(w * 0.9)
  const cL = Math.floor(w * 0.3)
  const cR = Math.floor(w * 0.7)

  type Row = {
    plant: number
    pot: number
    soil: number
    cPlant: number
    cPot: number
    rmin: number
    rmax: number
    pmin: number
    pmax: number
    potSpan: number
  }
  const rows: Row[] = []

  for (let y = 0; y < h; y++) {
    let plant = 0
    let pot = 0
    let soil = 0
    let cPlant = 0
    let cPot = 0
    let rmin = w
    let rmax = 0
    let pmin = w
    let pmax = 0
    for (let x = xL; x < xR; x++) {
      const i = (y * w + x) * ch
      const R = data[i]
      const G = data[i + 1]
      const B = data[i + 2]
      const inC = x >= cL && x < cR
      if (isPlantPx(R, G, B)) {
        plant++
        if (inC) cPlant++
        if (x < rmin) rmin = x
        if (x > rmax) rmax = x
      } else if (isPotPx(R, G, B)) {
        pot++
        if (inC) cPot++
        if (x < pmin) pmin = x
        if (x > pmax) pmax = x
        if (x < rmin) rmin = x
        if (x > rmax) rmax = x
      } else if (isSoilPx(R, G, B)) {
        soil++
        if (inC) cPot++
        if (x < pmin) pmin = x
        if (x > pmax) pmax = x
      }
    }
    rows.push({
      plant,
      pot,
      soil,
      cPlant,
      cPot,
      rmin,
      rmax,
      pmin,
      pmax,
      potSpan: pot > 0 ? pmax - pmin : 0,
    })
  }

  // --- plant top: eerste aanhoudende plant-pixels in het midden ---
  let plantTop = -1
  for (let y = 0; y < h - 4; y++) {
    if (
      rows[y].cPlant >= 6 &&
      rows[y + 1].plant + rows[y + 1].cPlant >= 8 &&
      rows[y + 2].plant >= 6
    ) {
      plantTop = y
      break
    }
  }
  if (plantTop < 0) {
    for (let y = 0; y < h - 2; y++) {
      if (rows[y].plant >= 12 && rows[y + 1].plant >= 10) {
        plantTop = y
        break
      }
    }
  }
  if (plantTop < 0) return null

  // --- pot bottom: laatste rij met pot-pixels (geen vloerschaduw) ---
  let potBottom = -1
  for (let y = h - 1; y >= plantTop; y--) {
    if (rows[y].cPot >= 5 || rows[y].pot >= 12) {
      potBottom = y
      break
    }
  }
  if (potBottom < 0) {
    for (let y = h - 1; y >= plantTop; y--) {
      if (rows[y].plant >= 12) {
        potBottom = y
        break
      }
    }
  }
  if (potBottom < 0) return null

  // --- pot rim: loop omhoog door pot-band; stop bij loof ---
  // Beperk breedte: donkere bladeren naast de pot zijn breder dan de pot.
  let basePotSpan = 0
  {
    const band = Math.max(3, Math.floor((potBottom - plantTop) * 0.04))
    const spans: number[] = []
    for (let y = potBottom - band; y <= potBottom; y++) {
      if (y >= 0 && rows[y].potSpan > 0) spans.push(rows[y].potSpan)
    }
    spans.sort((a, b) => a - b)
    basePotSpan = spans.length ? spans[Math.floor(spans.length / 2)] : 0
  }

  let potRim = potBottom
  let seen = false
  const plantH0 = Math.max(1, potBottom - plantTop)
  const minY = potBottom - Math.floor(plantH0 * 0.55)
  for (let y = potBottom; y >= Math.max(plantTop, minY); y--) {
    const row = rows[y]
    const potN = row.pot + row.soil
    const widthOk =
      basePotSpan <= 0 ||
      row.potSpan <= 0 ||
      row.potSpan <= basePotSpan * 1.45
    const potLike =
      potN >= 10 && potN >= row.plant * 0.65 && widthOk
    if (potLike) {
      potRim = y
      seen = true
    } else if (seen) {
      if (y >= potRim - 5 && potN >= 4 && widthOk) {
        potRim = y
        continue
      }
      if (row.plant >= 12 && row.plant > potN + 5) break
      if (y < potRim - 3 && potN < 3) break
      // opeens veel breder → bladeren, geen pot
      if (basePotSpan > 0 && row.potSpan > basePotSpan * 1.6) break
    }
  }
  // aarde boven in pot telt mee als rim
  for (
    let y = potRim;
    y >= Math.max(plantTop, potRim - Math.floor(plantH0 * 0.1));
    y--
  ) {
    if (rows[y].soil >= 5) potRim = y
  }

  const plantH = Math.max(1, potBottom - plantTop)
  const potH = potBottom - potRim
  const potFrac = potH / plantH
  const potOk = seen && potFrac >= 0.07 && potFrac <= 0.48 && potH >= 12

  let xmin = w
  let xmax = 0
  for (let y = plantTop; y <= potBottom; y++) {
    if (rows[y].plant + rows[y].pot < 8) continue
    xmin = Math.min(xmin, rows[y].rmin)
    xmax = Math.max(xmax, rows[y].rmax)
  }
  let potXmin = xmin
  let potXmax = xmax
  if (potOk) {
    let best = -1
    for (let y = potRim; y <= potBottom; y++) {
      if (rows[y].potSpan > best && rows[y].pot >= 8) {
        best = rows[y].potSpan
        potXmin = rows[y].pmin
        potXmax = rows[y].pmax
      }
    }
  }

  if (xmax <= xmin) return null

  return {
    plantTop,
    potBottom,
    potRim,
    potOk,
    xmin,
    xmax,
    potXmin,
    potXmax,
  }
}

/** @deprecated alias — detail-crop gebruikt nog bounds-vorm */
async function detectSubjectBounds(
  img: Buffer,
  size = DOEL
): Promise<{
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  potXmin: number
  potXmax: number
} | null> {
  const layout = await detectPlantLayout(img, size)
  if (!layout) return null
  return {
    xmin: layout.xmin,
    xmax: layout.xmax,
    ymin: layout.plantTop,
    ymax: layout.potBottom,
    potXmin: layout.potXmin,
    potXmax: layout.potXmax,
  }
}

/** Ingebedde serif (OFL) — SVG-tekst rendert betrouwbaar op Mac én Vercel. */
let _maatFontCss: string | null = null
function maatFontFaceCss(): string {
  if (_maatFontCss !== null) return _maatFontCss
  try {
    const fontPath = path.join(
      process.cwd(),
      'lib/fonts/LibreBaskerville-Regular.ttf'
    )
    const b64 = fs.readFileSync(fontPath).toString('base64')
    _maatFontCss = `@font-face{font-family:'SteraMaat';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:400;font-style:normal;}`
  } catch (e) {
    console.warn('[photo-pipeline] maat-font load failed, system fallback', e)
    _maatFontCss = ''
  }
  return _maatFontCss
}

/**
 * Maat-overlay — Stera Pro.
 *
 *   • Totale hoogte (rechts) — planttop → potbodem (pixel-detectie)
 *   • Pothoogte (links) — pot-rim → potbodem (detectie, of catalogus-proportie)
 *   • Diameter onderaan als tekst “Ø 27 cm” (geen balk, geen pill)
 *
 * Alleen Stera-groen + elegante serif. Geen witte pills.
 */
function maatSvg(
  S: number,
  m: MaatEntry,
  meta: StudioMeta,
  layout: PlantLayout | null
): Buffer | null {
  if (!m?.total || !Number.isFinite(m.total) || m.total <= 0) return null

  const fallbackBase = Math.round(S * (meta.base_frac ?? BASE_FRAC))
  const fallbackTop = fallbackBase - Math.round(S * PLANT_FRAC)

  // Ankers: pixel-layout van de échte plant (niet PLANT_FRAC / meta-schatten)
  const topY = layout?.plantTop ?? fallbackTop
  const baseY = layout?.potBottom ?? fallbackBase
  const plantH = Math.max(1, baseY - topY)

  // Catalogus-proportionele pot-top (fallback + sanity check)
  const propPotTop =
    m.pot && m.pot > 0 && m.pot < m.total
      ? baseY - Math.round(plantH * (m.pot / m.total))
      : null

  // Staande plant: pot-rim via detectie (+ catalogus-sanity), anders proportioneel
  let potTop: number | null = null
  if (!(meta.hanging && meta.pot_top_frac != null)) {
    if (layout?.potOk) {
      const det = layout.potRim
      if (propPotTop != null) {
        const drift = Math.abs(det - propPotTop) / plantH
        // Detectie te ver van catalogus-verhouding → meng (donker loof ≠ pot)
        potTop =
          drift > 0.1
            ? Math.round(det * 0.4 + propPotTop * 0.6)
            : det
      } else {
        potTop = det
      }
    } else if (propPotTop != null) {
      potTop = propPotTop
    }
    if (potTop != null) {
      potTop = Math.max(topY + 4, Math.min(baseY - 8, potTop))
    }
  }

  const edgePad = Math.round(S * 0.028)
  const plantLeft = layout?.xmin ?? Math.round(S * 0.22)
  const plantRight = layout?.xmax ?? Math.round(S * 0.78)
  const gap = Math.round(S * 0.04)
  // Balken net naast de plant, binnen het kader
  const xH = Math.min(S - edgePad, plantRight + gap)
  const xP = Math.max(edgePad, plantLeft - gap)

  const lw = Math.max(2, Math.round(S / 560))
  const tick = Math.max(7, Math.round(lw * 3.8))
  const fs = Math.max(26, Math.round(S * 0.023))
  const fsDiam = Math.max(24, Math.round(S * 0.021))
  const ink = STERA_GREEN
  const font = "SteraMaat, Georgia, 'Times New Roman', serif"

  const vDim = (x: number, y1: number, y2: number) => {
    const ya = Math.min(y1, y2)
    const yb = Math.max(y1, y2)
    return [
      `<line x1="${x}" y1="${ya}" x2="${x}" y2="${yb}" stroke="${ink}" stroke-width="${lw}" stroke-linecap="round"/>`,
      `<line x1="${x - tick}" y1="${ya}" x2="${x + tick}" y2="${ya}" stroke="${ink}" stroke-width="${lw}" stroke-linecap="round"/>`,
      `<line x1="${x - tick}" y1="${yb}" x2="${x + tick}" y2="${yb}" stroke="${ink}" stroke-width="${lw}" stroke-linecap="round"/>`,
    ].join('')
  }

  const label = (
    txt: string,
    x: number,
    y: number,
    anchor: 'start' | 'middle' | 'end',
    size = fs
  ) =>
    `<text x="${x}" y="${y}" fill="${ink}" font-size="${size}" font-weight="400" font-family="${font}" text-anchor="${anchor}" dominant-baseline="middle">${txt
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')}</text>`

  const parts: string[] = []

  // Totale hoogte rechts: planttop → potbodem
  parts.push(vDim(xH, topY, baseY))
  parts.push(
    label(
      `${Math.round(m.total)} cm`,
      xH - tick - Math.round(fs * 0.35),
      Math.round((topY + baseY) / 2),
      'end'
    )
  )

  // Pot-hoogte links
  if (m.pot && m.pot > 0 && m.pot < m.total) {
    if (meta.hanging && meta.pot_top_frac != null) {
      // Hangpot: pot hangt bovenaan; balk van planttop tot onderkant pot
      const hangPotBottom = Math.min(
        baseY - 4,
        Math.max(topY + 4, Math.round(S * meta.pot_top_frac))
      )
      if (hangPotBottom - topY > 4) {
        parts.push(vDim(xP, topY, hangPotBottom))
        parts.push(
          label(
            `${Math.round(m.pot)} cm`,
            xP + tick + Math.round(fs * 0.35),
            Math.round((topY + hangPotBottom) / 2),
            'start'
          )
        )
      }
    } else if (potTop != null && baseY - potTop > 4) {
      parts.push(vDim(xP, potTop, baseY))
      parts.push(
        label(
          `${Math.round(m.pot)} cm`,
          xP + tick + Math.round(fs * 0.35),
          Math.round((potTop + baseY) / 2),
          'start'
        )
      )
    }
  }

  // Diameter: alleen symbool + waarde onderaan (geen balk)
  let diamTxt: string | null = null
  if (m.diam && m.diam > 0) {
    diamTxt = `\u00D8 ${Math.round(m.diam)} cm` // Ø
  } else if (m.l && m.l > 0) {
    diamTxt = m.b
      ? `${Math.round(m.l)} \u00D7 ${Math.round(m.b)} cm`
      : `${Math.round(m.l)} cm`
  }
  if (diamTxt) {
    const yLabel = Math.min(
      S - Math.round(S * 0.03),
      baseY + Math.round(S * 0.05)
    )
    parts.push(label(diamTxt, Math.round(S / 2), yLabel, 'middle', fsDiam))
  }

  const style = maatFontFaceCss()
  return Buffer.from(
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">` +
      (style ? `<defs><style type="text/css">${style}</style></defs>` : '') +
      parts.join('') +
      `</svg>`
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
    .select(
      'height, diameter, diameter_culture_pot, length, width, height_culture_pot, pot_size'
    )
    .eq('itemcode', code)
    .maybeSingle()

  if (!data) return null
  const total = Number(data.height)
  if (!Number.isFinite(total) || total <= 0) return null

  const entry: MaatEntry = { total }

  // Pot-hoogte
  const pot = Number(data.height_culture_pot)
  if (Number.isFinite(pot) && pot > 0) entry.pot = pot

  // Ø = potdiameter: cultuurpot eerst, dan catalogus-diameter, dan pot_size
  const diamPot = Number(
    (data as { diameter_culture_pot?: number | null }).diameter_culture_pot
  )
  const diam = Number(data.diameter)
  if (Number.isFinite(diamPot) && diamPot > 0) {
    entry.diam = diamPot
  } else if (Number.isFinite(diam) && diam > 0) {
    entry.diam = diam
  } else if (data.pot_size) {
    const m = String(data.pot_size).match(/(?:ø|Ø|o)?\s*(\d+(?:[.,]\d+)?)/i)
    if (m) {
      const n = Number(m[1].replace(',', '.'))
      if (Number.isFinite(n) && n > 0) entry.diam = n
    }
  }

  // Rechthoekige bak: L × B (alleen als er geen pot-Ø is)
  const l = Number(data.length)
  const w = Number(data.width)
  if (!entry.diam && Number.isFinite(l) && l > 0) {
    entry.l = l
    if (Number.isFinite(w) && w > 0) entry.b = w
  }

  // pot_size tekst als pothoogte-fallback
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
  const base = await sharp(studioPng).resize(DOEL, DOEL).png().toBuffer()
  if (!maat) return base

  let layout: PlantLayout | null = null
  try {
    layout = await detectPlantLayout(base, DOEL)
  } catch (e) {
    console.warn('[photo-pipeline] plant-layout failed, fallback meta', e)
  }

  const svg = maatSvg(DOEL, maat, meta, layout)
  if (!svg) return base

  // Rasteriseer overlay apart (embedded font + tekst), daarna composieten.
  // density 72: SVG is al in DOEL-pixels; 144 schaalde overlay 2× (verkeerde balken).
  const overlay = await sharp(svg, { density: 72 })
    .resize(DOEL, DOEL)
    .png()
    .toBuffer()

  return sharp(base)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer()
}

/**
 * Alleen de maatfoto herbouwen vanuit bestaande studio (geen Grok/Nieuwkoop).
 * Handig na styling-fixes.
 */
export async function regenerateMaatForItem(
  itemcode: string
): Promise<{ itemcode: string; maatPath: string }> {
  const code = itemcode.trim().toUpperCase()
  const sb = admin()

  const studioCandidates = [`studio/${code}.jpg`, `studio/${code}.png`]
  let studioBuf: Buffer | null = null
  for (const p of studioCandidates) {
    const { data, error } = await sb.storage.from(MEDIA_BUCKET).download(p)
    if (!error && data) {
      studioBuf = Buffer.from(await data.arrayBuffer())
      break
    }
  }
  if (!studioBuf) {
    throw new Error(`${code}: geen studio-foto in storage (genereer eerst de set)`)
  }

  const { data: productRow } = await sb
    .from('nieuwkoop_products')
    .select('itemcode, description, item_variety_nl, tags')
    .eq('itemcode', code)
    .maybeSingle()
  const hanging = detectIsHanger(productRow ?? {})

  const maatEntry = await resolveMaatEntry(sb, code)
  if (!maatEntry) {
    console.warn(`[photo-pipeline] ${code}: geen maten — maat = studio`)
  }

  // Meta: silhouet-detectie in makeMaat; base_frac uit compositie-default
  const meta: StudioMeta = {
    base_frac: hanging ? 0.92 : BASE_FRAC,
    pot_w_frac: 0.25,
    hanging,
  }

  const maatPng = await makeMaat(studioBuf, maatEntry, meta)
  const maatJpeg = await toWebJpeg(maatPng)
  const maatPath = `maat/${code}.jpg`
  await upload(sb, maatPath, maatJpeg, 'image/jpeg')
  await sb.storage.from(MEDIA_BUCKET).remove([`maat/${code}.png`]).catch(() => null)

  const now = new Date().toISOString()
  await sb.from('product_enrichment').upsert(
    {
      itemcode: code,
      maat_image_path: maatPath,
      // Bump versie → thumbs/full krijgen nieuwe ?v= (anders immutable-cache op oude thumb)
      photoset_generated_at: now,
      updated_at: now,
    },
    { onConflict: 'itemcode' }
  )

  console.log(
    `[photo-pipeline] ${code}: maat herbouwd (${Math.round(maatJpeg.byteLength / 1024)} KB)`
  )
  return { itemcode: code, maatPath }
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

  const sb = admin()
  // Specs voor hanger-detectie (variety / PlantShape / beschrijving)
  const { data: productRow } = await sb
    .from('nieuwkoop_products')
    .select('itemcode, description, item_variety_nl, tags')
    .eq('itemcode', code)
    .maybeSingle()
  const hanging = detectIsHanger(productRow ?? {})
  if (hanging) {
    console.log(
      `[photo-pipeline] ${code}: HANGPLANT herkend` +
        (productRow?.item_variety_nl
          ? ` (variety=${productRow.item_variety_nl})`
          : '')
    )
  }

  console.log(`[photo-pipeline] ${code}: cutout…`)
  const cutout = await fetchNieuwkoopCutout(code)

  console.log(
    `[photo-pipeline] ${code}: studio-basis${hanging ? ' (hangend)' : ''}…`
  )
  const { studioPng, potMaskPng, meta } = await buildStudioFromCutout(cutout, {
    hanging,
  })

  console.log(`[photo-pipeline] ${code}: Grok Imagine${hanging ? ' (hangend)' : ''}…`)
  let aiPng = await aiEditGrok(studioPng, { hanging })

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
