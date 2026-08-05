#!/usr/bin/env node
/**
 * Eén itemcode: dezelfde pipeline als de combinatie-fotos
 *   cutout → build-studio-v2.py → Grok Imagine → maak-fotoset.py
 * Output: studio-final / detail / maat PNG in --out dir
 *
 * Gebruik:
 *   node run-one.mjs --out=/tmp/fotos CC0060777
 *   (env: XAI_API_KEY, NIEUWKOOP_*)
 */
import { execFileSync } from 'node:child_process'
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const rawArgs = process.argv.slice(2)
const argVal = (name, fallback) => {
  const hit = rawArgs.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const FORCE_AI = rawArgs.includes('--force-ai')
const OUT = argVal('out', join(DIR, 'out'))
const PROVIDER = (argVal('provider', process.env.AI_PROVIDER || 'grok')).toLowerCase()
const RESOLUTION = argVal('resolution', process.env.AI_RESOLUTION || '1k')
const MODEL = argVal(
  'model',
  process.env.AI_MODEL ||
    (PROVIDER === 'openai' ? 'gpt-image-1' : 'grok-imagine-image-quality'),
)
const codes = rawArgs.filter((a) => !a.startsWith('--')).map((c) => c.toUpperCase())

mkdirSync(OUT, { recursive: true })

const PROMPT = `Re-render this exact image as a professional studio product photograph. CRITICAL: keep the composition IDENTICAL — same square 1:1 format, plant in the exact same position and size, same warm beige background colors, same margins. Do not zoom, crop, move or resize anything. The plant and pot must stay 100% identical: same leaves with the same variegation pattern, same pot shape and texture — this is a real product photo. The floor-wall transition must stay barely visible, very gradual. Lighting: one large soft light source from the upper front-left, giving the plant photographic depth and one very soft, diffuse natural shadow of plant and pot together falling slightly to the right on the floor. No hard shadow edges. Crisp sharp foliage. THE POT: you may light the pot naturally — highlights and soft shading from the light source are welcome — but its texture pattern, material, base color and color temperature must remain exactly as in the input image. Do not smooth, repaint or re-texture the pot and do not let the beige background tint it. Leaf colors must also stay true to the input. No props, no text.`

const NK = {
  base: process.env.NIEUWKOOP_API_BASE_URL?.replace(/\/$/, ''),
  auth:
    'Basic ' +
    Buffer.from(
      `${process.env.NIEUWKOOP_API_USER}:${process.env.NIEUWKOOP_API_PASSWORD}`
    ).toString('base64'),
}

async function nieuwkoopCutout(code) {
  const dst = join(OUT, `hires-${code}.png`)
  if (existsSync(dst) && !FORCE_AI) return dst
  const r = await fetch(`${NK.base}/items/${encodeURIComponent(code)}/image`, {
    headers: { Authorization: NK.auth, Accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`Nieuwkoop ${code}: HTTP ${r.status}`)
  const j = await r.json()
  let b64 = String(j.Image || j.image || '').replace(/^data:image\/[a-z]+;base64,/i, '')
  if (!b64) throw new Error(`Nieuwkoop ${code}: geen Image-veld`)
  writeFileSync(dst, Buffer.from(b64, 'base64'))
  return dst
}

async function aiEditGrok(inputPath, dst) {
  const key = process.env.XAI_API_KEY
  if (!key) throw new Error('XAI_API_KEY ontbreekt')
  if (existsSync(dst) && !FORCE_AI) {
    console.log('  AI-cache:', dst)
    return dst
  }
  if (existsSync(dst) && FORCE_AI) unlinkSync(dst)

  console.log(`  AI (grok / ${MODEL} / ${RESOLUTION})…`)
  const b64in = readFileSync(inputPath).toString('base64')
  const body = {
    model: MODEL,
    prompt: PROMPT,
    image: { url: `data:image/png;base64,${b64in}`, type: 'image_url' },
    aspect_ratio: '1:1',
    resolution: RESOLUTION === '2k' ? '2k' : '1k',
    response_format: 'b64_json',
  }
  const r = await fetch('https://api.x.ai/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let d
  try {
    d = JSON.parse(text)
  } catch {
    throw new Error(`Grok HTTP ${r.status}: ${text.slice(0, 200)}`)
  }
  if (!r.ok || d.error) {
    throw new Error(d.error?.message || d.message || `Grok ${r.status}`)
  }
  const item = d.data?.[0] || d
  if (item.b64_json) {
    writeFileSync(dst, Buffer.from(item.b64_json, 'base64'))
    return dst
  }
  const url = item.url || d.url
  if (url) {
    const img = await fetch(url)
    if (!img.ok) throw new Error(`Grok download HTTP ${img.status}`)
    writeFileSync(dst, Buffer.from(await img.arrayBuffer()))
    return dst
  }
  throw new Error('Grok: geen b64_json/url')
}

async function verwerk(code) {
  console.log(`\n=== ${code} (combinatie-stijl pipeline) ===`)
  if (!NK.base) throw new Error('NIEUWKOOP_API_BASE_URL ontbreekt')

  const cutout = await nieuwkoopCutout(code)
  console.log('  cutout ok')

  const basis = join(OUT, `studio-${code}.png`)
  console.log('  build-studio-v2.py…')
  execFileSync('python3', [join(DIR, 'build-studio-v2.py'), cutout, basis], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  const ai = join(OUT, `ai-${code}.png`)
  await aiEditGrok(basis, ai)

  console.log('  maak-fotoset.py…')
  execFileSync('python3', [join(DIR, 'maak-fotoset.py'), ai, code, OUT], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  const paths = {
    studio: join(OUT, `studio-final-${code}.png`),
    detail: join(OUT, `detail-${code}.png`),
    maat: join(OUT, `maat-${code}.png`),
  }
  for (const [k, p] of Object.entries(paths)) {
    if (!existsSync(p)) throw new Error(`Ontbreekt na fotoset: ${k} → ${p}`)
  }
  console.log('  ✓ studio-final + detail + maat')
  // Print JSON line for parent process
  console.log('RESULT_JSON:' + JSON.stringify({ itemcode: code, ...paths }))
  return paths
}

if (!codes.length) {
  console.error('Gebruik: node run-one.mjs --out=DIR [--force-ai] <itemcode>…')
  process.exit(1)
}

for (const code of codes) {
  await verwerk(code)
}
