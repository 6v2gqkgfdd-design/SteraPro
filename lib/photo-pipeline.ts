/**
 * Studio-fotoset: zelfde flow als de combinatie-pipeline.
 *
 *   Nieuwkoop cutout
 *     → build-studio-v2.py  (warme perzik-beige studio, plant 100% echt)
 *     → Grok Imagine edit   (zelfde prompt als pipeline-fotos.mjs)
 *     → maak-fotoset.py     (studio-final + detail + maat)
 *     → Storage studio/ detail/ maat/
 *
 * Vereist op de host: python3, Pillow, XAI_API_KEY, NIEUWKOOP_*.
 * Op Vercel zonder Python: faalt met duidelijke melding → terminal gebruiken.
 */

import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { MEDIA_BUCKET } from '@/lib/product-media'

const execFileAsync = promisify(execFile)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PIPELINE_DIR = join(ROOT, 'scripts', 'photo-pipeline')
const RUN_ONE = join(PIPELINE_DIR, 'run-one.mjs')

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
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
 * Volledige set voor één itemcode — combinatie-stijl pipeline.
 */
export async function generatePhotosetForItem(itemcode: string): Promise<PhotosetResult> {
  const code = itemcode.trim().toUpperCase()

  if (!existsSync(RUN_ONE)) {
    throw new Error(`Pipeline-script ontbreekt: ${RUN_ONE}`)
  }
  if (!process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY ontbreekt (Grok Imagine)')
  }
  if (!process.env.NIEUWKOOP_API_BASE_URL) {
    throw new Error('NIEUWKOOP_API_* ontbreekt')
  }

  // Snel check: python3 beschikbaar?
  try {
    await execFileAsync('python3', ['--version'], { timeout: 5000 })
  } catch {
    throw new Error(
      'python3 ontbreekt op deze server. Draai de pipeline lokaal via terminal: npm run optimize-photos'
    )
  }

  const work = mkdtempSync(join(tmpdir(), `stera-foto-${code}-`))
  try {
    const env = {
      ...process.env,
      AI_PROVIDER: process.env.AI_PROVIDER || 'grok',
      AI_MODEL: process.env.AI_MODEL || 'grok-imagine-image-quality',
      AI_RESOLUTION: process.env.AI_RESOLUTION || '1k',
    }

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [RUN_ONE, `--out=${work}`, '--force-ai', code],
      {
        env,
        cwd: PIPELINE_DIR,
        timeout: 280_000,
        maxBuffer: 20 * 1024 * 1024,
      }
    )
    if (stderr) console.error('[photo-pipeline]', stderr.slice(0, 500))

    // Parse RESULT_JSON line
    const line = (stdout || '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('RESULT_JSON:'))
    if (!line) {
      throw new Error(
        'Pipeline gaf geen RESULT_JSON. Output: ' + (stdout || '').slice(-400)
      )
    }
    const parsed = JSON.parse(line.slice('RESULT_JSON:'.length)) as {
      itemcode: string
      studio: string
      detail: string
      maat: string
    }

    for (const p of [parsed.studio, parsed.detail, parsed.maat]) {
      if (!existsSync(p)) throw new Error(`Output ontbreekt: ${p}`)
    }

    const studioBuf = readFileSync(parsed.studio)
    const detailBuf = readFileSync(parsed.detail)
    const maatBuf = readFileSync(parsed.maat)

    // PNG → we slaan op als png in storage (betere kwaliteit, match pipeline)
    const studioPath = `studio/${code}.png`
    const detailPath = `detail/${code}.png`
    const maatPath = `maat/${code}.png`

    const sb = admin()
    await upload(sb, studioPath, studioBuf, 'image/png')
    await upload(sb, detailPath, detailBuf, 'image/png')
    await upload(sb, maatPath, maatBuf, 'image/png')

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

    return { itemcode: code, studioPath, detailPath, maatPath }
  } finally {
    try {
      rmSync(work, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}
