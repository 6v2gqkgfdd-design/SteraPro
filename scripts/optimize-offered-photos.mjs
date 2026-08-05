#!/usr/bin/env node
/**
 * Batch foto-pipeline via terminal (geen admin-UI nodig).
 *
 * Selecteert: shopify_offered_items (offered) && !product_enrichment.optimized
 * Per item: Nieuwkoop cutout → studio-basis → Grok Imagine → detail + maat → Storage
 *
 * Gebruik (vanuit SteraPro-map):
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs --limit=5
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs --dry-run
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs --force   # ook al-geoptimaliseerde
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs --mark-optimized
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs CC0060777 CC0066028
 *
 * Env:
 *   XAI_API_KEY, NIEUWKOOP_*, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   optioneel: AI_MODEL, AI_RESOLUTION (1k|2k)
 *
 * Let op: Grok Imagine (xAI API) wordt wél aangeroepen — dat is de studio-AI.
 * "Zonder Grok hier" = zonder de chat/UI; de API-key in .env.local is wél nodig.
 */

import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')

const rawArgs = process.argv.slice(2)
const flags = new Set(rawArgs.filter((a) => a.startsWith('--') && !a.includes('=')))
const argVal = (name, fallback) => {
  const hit = rawArgs.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const DRY = flags.has('--dry-run')
const FORCE = flags.has('--force')
const MARK_OPT = flags.has('--mark-optimized')
const LIMIT = parseInt(argVal('limit', '0'), 10) || 0
const SLEEP_MS = parseInt(argVal('sleep-ms', '2000'), 10) || 2000
const explicitCodes = rawArgs
  .filter((a) => !a.startsWith('--'))
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean)

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const XAI = process.env.XAI_API_KEY

const missing = []
if (!SUPA_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
if (!SUPA_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!process.env.NIEUWKOOP_API_BASE_URL) missing.push('NIEUWKOOP_API_BASE_URL')
if (!process.env.NIEUWKOOP_API_USER) missing.push('NIEUWKOOP_API_USER')
if (!process.env.NIEUWKOOP_API_PASSWORD) missing.push('NIEUWKOOP_API_PASSWORD')
if (!XAI && !DRY) missing.push('XAI_API_KEY')
if (missing.length) {
  console.error('❌ Ontbrekende env:', missing.join(', '))
  console.error('   node --env-file=.env.local scripts/optimize-offered-photos.mjs')
  process.exit(1)
}

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

const SIZE = 1024
const BEIGE = { r: 232, g: 220, b: 200 }
const BUCKET = 'nieuwkoop-images'
const PROMPT = `Re-render this exact image as a professional studio product photograph. CRITICAL: keep the composition IDENTICAL — same square 1:1 format, plant in the exact same position and size, same warm beige background colors, same margins. Do not zoom, crop, move or resize anything. The plant and pot must stay 100% identical: same leaves with the same variegation pattern, same pot shape and texture — this is a real product photo. The floor-wall transition must stay barely visible, very gradual. Lighting: one large soft light source from the upper front-left, giving the plant photographic depth and one very soft, diffuse natural shadow of plant and pot together falling slightly to the right on the floor. No hard shadow edges. Crisp sharp foliage. THE POT: you may light the pot naturally — highlights and soft shading from the light source are welcome — but its texture pattern, material, base color and color temperature must remain exactly as in the input image. Do not smooth, repaint or re-texture the pot and do not let the beige background tint it. Leaf colors must also stay true to the input. No props, no text.`

async function fetchCutout(code) {
  const base = process.env.NIEUWKOOP_API_BASE_URL.replace(/\/$/, '')
  const auth =
    'Basic ' +
    Buffer.from(
      `${process.env.NIEUWKOOP_API_USER}:${process.env.NIEUWKOOP_API_PASSWORD}`
    ).toString('base64')
  const r = await fetch(`${base}/items/${encodeURIComponent(code)}/image`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`Nieuwkoop image HTTP ${r.status}`)
  const j = await r.json()
  const b64 = String(j.Image || j.image || '').replace(/^data:image\/\w+;base64,/, '')
  if (!b64) throw new Error('geen Image-veld')
  return Buffer.from(b64, 'base64')
}

async function buildBasis(cutout) {
  const plant = await sharp(cutout)
    .ensureAlpha()
    .resize(SIZE, SIZE, { fit: 'inside' })
    .png()
    .toBuffer()
  const meta = await sharp(plant).metadata()
  const pw = meta.width || SIZE
  const ph = meta.height || SIZE
  const left = Math.round((SIZE - pw) / 2)
  const top = Math.round(SIZE - ph - SIZE * 0.06)
  const bg = await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: BEIGE },
  })
    .png()
    .toBuffer()
  return sharp(bg)
    .composite([{ input: plant, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer()
}

async function grokEdit(basisPng) {
  const model = process.env.AI_MODEL || 'grok-imagine-image-quality'
  const resolution = process.env.AI_RESOLUTION === '2k' ? '2k' : '1k'
  const r = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${XAI}`,
    },
    body: JSON.stringify({
      model,
      prompt: PROMPT,
      image: {
        url: `data:image/png;base64,${basisPng.toString('base64')}`,
        type: 'image_url',
      },
      aspect_ratio: '1:1',
      resolution,
      response_format: 'b64_json',
    }),
  })
  const text = await r.text()
  let d
  try {
    d = JSON.parse(text)
  } catch {
    throw new Error(`Grok HTTP ${r.status}: ${text.slice(0, 200)}`)
  }
  if (!r.ok || d.error) throw new Error(d.error?.message || `Grok ${r.status}`)
  const item = d.data?.[0] || d
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64')
  const url = item.url || d.url
  if (url) {
    const img = await fetch(url)
    if (!img.ok) throw new Error(`download ${img.status}`)
    return Buffer.from(await img.arrayBuffer())
  }
  throw new Error('geen image in Grok-response')
}

async function makeDetail(studio) {
  const side = Math.round(SIZE * 0.55)
  const left = Math.round((SIZE - side) / 2)
  const top = Math.round(SIZE * 0.08)
  return sharp(studio)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE)
    .sharpen()
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function makeMaat(studio, height, diameter) {
  const base = await sharp(studio)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .ensureAlpha()
    .png()
    .toBuffer()
  const labels = []
  if (height > 0) labels.push(`H ${Math.round(height)} cm`)
  if (diameter > 0) labels.push(`Ø ${Math.round(diameter)} cm`)
  if (!labels.length) return sharp(base).jpeg({ quality: 90 }).toBuffer()
  const text = labels.join('  ·  ')
  const lineX = Math.round(SIZE * 0.12)
  const y0 = Math.round(SIZE * 0.12)
  const y1 = Math.round(SIZE * 0.88)
  const svg = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${lineX}" y1="${y0}" x2="${lineX}" y2="${y1}" stroke="rgba(122,138,110,0.92)" stroke-width="3"/>
  <line x1="${lineX - 12}" y1="${y0}" x2="${lineX + 12}" y2="${y0}" stroke="rgba(122,138,110,0.92)" stroke-width="3"/>
  <line x1="${lineX - 12}" y1="${y1}" x2="${lineX + 12}" y2="${y1}" stroke="rgba(122,138,110,0.92)" stroke-width="3"/>
  <rect x="${lineX + 20}" y="${y0}" width="${Math.min(420, 28 + text.length * 11)}" height="36" rx="8" fill="rgba(242,237,224,0.88)"/>
  <text x="${lineX + 32}" y="${y0 + 24}" font-family="system-ui,sans-serif" font-size="20" fill="#3d4a36">${text}</text>
</svg>`
  return sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function upload(path, buf) {
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw new Error(`storage ${path}: ${error.message}`)
}

async function processOne(code) {
  console.log(`\n=== ${code} ===`)
  const { data: prod } = await sb
    .from('nieuwkoop_products')
    .select('height, diameter, description')
    .eq('itemcode', code)
    .maybeSingle()
  console.log('  ', prod?.description || code)

  if (DRY) {
    console.log('  [dry-run] zou studio+detail+maat genereren')
    return 'dry'
  }

  console.log('  cutout…')
  const cutout = await fetchCutout(code)
  console.log('  basis…')
  const basis = await buildBasis(cutout)
  console.log('  Grok Imagine…')
  const ai = await grokEdit(basis)
  const studio = await sharp(ai)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .jpeg({ quality: 92 })
    .toBuffer()
  console.log('  detail + maat…')
  const detail = await makeDetail(studio)
  const maat = await makeMaat(
    studio,
    Number(prod?.height || 0),
    Number(prod?.diameter || 0)
  )

  const studioPath = `studio/${code}.jpg`
  const detailPath = `detail/${code}.jpg`
  const maatPath = `maat/${code}.jpg`
  await upload(studioPath, studio)
  await upload(detailPath, detail)
  await upload(maatPath, maat)

  const now = new Date().toISOString()
  const row = {
    itemcode: code,
    studio_image_path: studioPath,
    detail_image_path: detailPath,
    maat_image_path: maatPath,
    photoset_generated_at: now,
    updated_at: now,
  }
  if (MARK_OPT) {
    row.optimized = true
    row.ready_for_shopify = true
  }
  const { error } = await sb.from('product_enrichment').upsert(row, { onConflict: 'itemcode' })
  if (error) throw new Error(error.message)
  console.log('  ✓ opgeslagen', studioPath, detailPath, maatPath, MARK_OPT ? '(+ optimized)' : '')
  return 'ok'
}

// ─── main ─────────────────────────────────────────────────────────────────
console.log('='.repeat(60))
console.log('Optimaliseer aangeboden producten (studio + detail + maat)')
console.log('='.repeat(60))
console.log('Dry-run:       ', DRY)
console.log('Force:         ', FORCE)
console.log('Mark optimized:', MARK_OPT)
console.log('Limit:         ', LIMIT || 'geen')
console.log('Sleep ms:      ', SLEEP_MS)

let codes = explicitCodes
if (!codes.length) {
  const { data: offered, error } = await sb
    .from('shopify_offered_items')
    .select('itemcode')
    .eq('offered', true)
  if (error) {
    console.error('❌ offered:', error.message)
    process.exit(1)
  }
  codes = (offered || []).map((r) => r.itemcode)
  if (!FORCE && codes.length) {
    const { data: enr } = await sb
      .from('product_enrichment')
      .select('itemcode, optimized, studio_image_path')
      .in('itemcode', codes)
    const by = new Map((enr || []).map((e) => [e.itemcode, e]))
    codes = codes.filter((c) => {
      const e = by.get(c)
      return !e?.optimized
    })
  }
}

if (LIMIT > 0) codes = codes.slice(0, LIMIT)
console.log(`\nTe verwerken: ${codes.length} items`)
if (!codes.length) {
  console.log('Niets te doen. Zet producten op Aanbieden, of gebruik --force / itemcodes.')
  process.exit(0)
}

let ok = 0
let fail = 0
const errors = []
for (const code of codes) {
  try {
    await processOne(code)
    ok++
  } catch (e) {
    fail++
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`  ❌ ${code}:`, msg)
    errors.push(`${code}: ${msg}`)
  }
  if (SLEEP_MS > 0 && codes.indexOf(code) < codes.length - 1) {
    await new Promise((r) => setTimeout(r, SLEEP_MS))
  }
}

console.log('\n' + '='.repeat(60))
console.log(`Klaar. ok=${ok} fail=${fail}`)
if (errors.length) {
  console.log('Fouten:')
  errors.slice(0, 10).forEach((e) => console.log(' ', e))
}
console.log('='.repeat(60))
console.log(`
In de catalogus:
  - thumbnail = studiofoto
  - detail toont studio + detail + maat + NK-origineel
  - markeer zelf "Afgewerkt" of gebruik --mark-optimized

Herhaal / hervat: zelfde commando (sla over wat al optimized is, tenzij --force)
`)
process.exit(fail ? 1 : 0)
