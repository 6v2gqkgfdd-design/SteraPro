/**
 * Studio-fotoset pipeline (Node):
 *   Nieuwkoop-cutout → beige studio-basis → Grok Imagine → detail + maat → Storage
 *
 * Output in bucket nieuwkoop-images:
 *   studio/{code}.jpg  detail/{code}.jpg  maat/{code}.jpg
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { MEDIA_BUCKET } from '@/lib/product-media'

const PROMPT = `Re-render this exact image as a professional studio product photograph. CRITICAL: keep the composition IDENTICAL — same square 1:1 format, plant in the exact same position and size, same warm beige background colors, same margins. Do not zoom, crop, move or resize anything. The plant and pot must stay 100% identical: same leaves with the same variegation pattern, same pot shape and texture — this is a real product photo. The floor-wall transition must stay barely visible, very gradual. Lighting: one large soft light source from the upper front-left, giving the plant photographic depth and one very soft, diffuse natural shadow of plant and pot together falling slightly to the right on the floor. No hard shadow edges. Crisp sharp foliage. THE POT: you may light the pot naturally — highlights and soft shading from the light source are welcome — but its texture pattern, material, base color and color temperature must remain exactly as in the input image. Do not smooth, repaint or re-texture the pot and do not let the beige background tint it. Leaf colors must also stay true to the input. No props, no text.`

const SIZE = 1024
const BEIGE = { r: 232, g: 220, b: 200 }

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function fetchNieuwkoopCutout(itemcode: string): Promise<Buffer> {
  const base = process.env.NIEUWKOOP_API_BASE_URL?.replace(/\/$/, '')
  const user = process.env.NIEUWKOOP_API_USER
  const pass = process.env.NIEUWKOOP_API_PASSWORD
  if (!base || !user || !pass) throw new Error('Nieuwkoop env ontbreekt')

  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
  const r = await fetch(`${base}/items/${encodeURIComponent(itemcode)}/image`, {
    headers: { Authorization: auth, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`Nieuwkoop image HTTP ${r.status}`)
  const j = (await r.json()) as { Image?: string; image?: string }
  const b64 = String(j.Image || j.image || '').replace(/^data:image\/\w+;base64,/, '')
  if (!b64) throw new Error('Nieuwkoop: geen Image-veld')
  return Buffer.from(b64, 'base64')
}

/** Plant op warme beige studio-achtergrond (sharp). */
async function buildStudioBasis(cutout: Buffer): Promise<Buffer> {
  const plant = await sharp(cutout)
    .ensureAlpha()
    .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()

  const meta = await sharp(plant).metadata()
  const pw = meta.width || SIZE
  const ph = meta.height || SIZE
  // Zet plant onderaan, gecentreerd
  const left = Math.round((SIZE - pw) / 2)
  const top = Math.round(SIZE - ph - SIZE * 0.06)

  const bg = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: BEIGE,
    },
  })
    .png()
    .toBuffer()

  return sharp(bg)
    .composite([{ input: plant, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer()
}

async function grokStudioEdit(basisPng: Buffer): Promise<Buffer> {
  const key = process.env.XAI_API_KEY
  if (!key) throw new Error('XAI_API_KEY ontbreekt (Grok Imagine)')

  const model =
    process.env.AI_MODEL || 'grok-imagine-image-quality'
  const resolution = process.env.AI_RESOLUTION === '2k' ? '2k' : '1k'
  const b64in = basisPng.toString('base64')

  const r = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt: PROMPT,
      image: { url: `data:image/png;base64,${b64in}`, type: 'image_url' },
      aspect_ratio: '1:1',
      resolution,
      response_format: 'b64_json',
    }),
  })
  const text = await r.text()
  let d: {
    error?: { message?: string }
    data?: Array<{ b64_json?: string; url?: string }>
    b64_json?: string
    url?: string
  }
  try {
    d = JSON.parse(text)
  } catch {
    throw new Error(`Grok HTTP ${r.status}: ${text.slice(0, 200)}`)
  }
  if (!r.ok || d.error) {
    throw new Error(d.error?.message || `Grok Imagine mislukt (${r.status})`)
  }
  const item = d.data?.[0] || d
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64')
  const url = item.url || d.url
  if (url) {
    const img = await fetch(url)
    if (!img.ok) throw new Error(`Grok download HTTP ${img.status}`)
    return Buffer.from(await img.arrayBuffer())
  }
  throw new Error('Grok: geen image in response')
}

/** Close-up op bovenste bladzone. */
async function makeDetail(studio: Buffer): Promise<Buffer> {
  const img = sharp(studio).resize(SIZE, SIZE, { fit: 'cover' })
  // Crop: midden-boven (bladmassa)
  const side = Math.round(SIZE * 0.55)
  const left = Math.round((SIZE - side) / 2)
  const top = Math.round(SIZE * 0.08)
  return img
    .extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE)
    .sharpen()
    .jpeg({ quality: 90 })
    .toBuffer()
}

/** Maatlijnen op basis van DB hoogte/diameter (cm). */
async function makeMaat(
  studio: Buffer,
  dims: { height?: number | null; diameter?: number | null }
): Promise<Buffer> {
  const base = await sharp(studio)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .ensureAlpha()
    .png()
    .toBuffer()

  const labels: string[] = []
  if (dims.height && dims.height > 0) labels.push(`H ${Math.round(dims.height)} cm`)
  if (dims.diameter && dims.diameter > 0) labels.push(`Ø ${Math.round(dims.diameter)} cm`)

  if (labels.length === 0) {
    return sharp(base).jpeg({ quality: 90 }).toBuffer()
  }

  // SVG overlay met zachte salie-lijnen
  const h = dims.height && dims.height > 0 ? Math.round(dims.height) : null
  const d = dims.diameter && dims.diameter > 0 ? Math.round(dims.diameter) : null
  const lineX = Math.round(SIZE * 0.12)
  const y0 = Math.round(SIZE * 0.12)
  const y1 = Math.round(SIZE * 0.88)
  const text = labels.join('  ·  ')

  const svg = `
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${lineX}" y1="${y0}" x2="${lineX}" y2="${y1}" stroke="rgba(122,138,110,0.92)" stroke-width="3"/>
  <line x1="${lineX - 12}" y1="${y0}" x2="${lineX + 12}" y2="${y0}" stroke="rgba(122,138,110,0.92)" stroke-width="3"/>
  <line x1="${lineX - 12}" y1="${y1}" x2="${lineX + 12}" y2="${y1}" stroke="rgba(122,138,110,0.92)" stroke-width="3"/>
  ${
    d
      ? `<line x1="${Math.round(SIZE * 0.35)}" y1="${Math.round(SIZE * 0.9)}" x2="${Math.round(SIZE * 0.65)}" y2="${Math.round(SIZE * 0.9)}" stroke="rgba(122,138,110,0.92)" stroke-width="3"/>`
      : ''
  }
  <rect x="${lineX + 20}" y="${y0}" width="${Math.min(420, 28 + text.length * 11)}" height="36" rx="8" fill="rgba(242,237,224,0.88)"/>
  <text x="${lineX + 32}" y="${y0 + 24}" font-family="system-ui,sans-serif" font-size="20" fill="#3d4a36">${text}</text>
</svg>`

  return sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function upload(
  sb: ReturnType<typeof admin>,
  path: string,
  buf: Buffer,
  contentType: string
) {
  const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, buf, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`Storage ${path}: ${error.message}`)
}

export type PhotosetResult = {
  itemcode: string
  studioPath: string
  detailPath: string
  maatPath: string
}

/**
 * Volledige set voor één itemcode. Werkt met service role (cron/API).
 */
export async function generatePhotosetForItem(itemcode: string): Promise<PhotosetResult> {
  const code = itemcode.trim().toUpperCase()
  const sb = admin()

  const { data: prod } = await sb
    .from('nieuwkoop_products')
    .select('height, diameter')
    .eq('itemcode', code)
    .maybeSingle()

  const cutout = await fetchNieuwkoopCutout(code)
  const basis = await buildStudioBasis(cutout)
  const studioAi = await grokStudioEdit(basis)
  // Normaliseer studio naar jpg 1024
  const studioJpg = await sharp(studioAi)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .jpeg({ quality: 92 })
    .toBuffer()

  const detailJpg = await makeDetail(studioJpg)
  const maatJpg = await makeMaat(studioJpg, {
    height: prod?.height != null ? Number(prod.height) : null,
    diameter: prod?.diameter != null ? Number(prod.diameter) : null,
  })

  const studioPath = `studio/${code}.jpg`
  const detailPath = `detail/${code}.jpg`
  const maatPath = `maat/${code}.jpg`

  await upload(sb, studioPath, studioJpg, 'image/jpeg')
  await upload(sb, detailPath, detailJpg, 'image/jpeg')
  await upload(sb, maatPath, maatJpg, 'image/jpeg')

  const now = new Date().toISOString()
  const { error } = await sb.from('product_enrichment').upsert(
    {
      itemcode: code,
      studio_image_path: studioPath,
      detail_image_path: detailPath,
      maat_image_path: maatPath,
      photoset_generated_at: now,
      // Niet auto-optimized: menselijke review blijft mogelijk
      updated_at: now,
    },
    { onConflict: 'itemcode' }
  )
  if (error) throw new Error(`enrichment update: ${error.message}`)

  return { itemcode: code, studioPath, detailPath, maatPath }
}
