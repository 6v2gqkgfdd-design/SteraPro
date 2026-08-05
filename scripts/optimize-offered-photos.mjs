#!/usr/bin/env node
/**
 * Batch via terminal — zelfde pipeline als combinaties
 * (build-studio-v2.py → Grok → maak-fotoset.py → Supabase Storage).
 *
 *   cd SteraPro
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs --limit=5
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs --dry-run
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs --mark-optimized
 *   node --env-file=.env.local scripts/optimize-offered-photos.mjs CC0060777
 */

import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')
const PIPELINE = join(DIR, 'photo-pipeline')
const RUN_ONE = join(PIPELINE, 'run-one.mjs')
const BUCKET = 'nieuwkoop-images'

const rawArgs = process.argv.slice(2)
const flags = new Set(rawArgs.filter((a) => a.startsWith('--') && !a.includes('=')))
const argVal = (name, fallback) => {
  const hit = rawArgs.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const DRY = flags.has('--dry-run')
const FORCE = flags.has('--force')
const FORCE_AI = flags.has('--force-ai')
const MARK_OPT = flags.has('--mark-optimized')
const LIMIT = parseInt(argVal('limit', '0'), 10) || 0
const SLEEP_MS = parseInt(argVal('sleep-ms', '2000'), 10) || 2000
const explicitCodes = rawArgs
  .filter((a) => !a.startsWith('--'))
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean)

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const missing = []
if (!SUPA_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
if (!SUPA_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!process.env.NIEUWKOOP_API_BASE_URL) missing.push('NIEUWKOOP_API_BASE_URL')
if (!process.env.NIEUWKOOP_API_USER) missing.push('NIEUWKOOP_API_USER')
if (!process.env.NIEUWKOOP_API_PASSWORD) missing.push('NIEUWKOOP_API_PASSWORD')
if (!process.env.XAI_API_KEY && !DRY) missing.push('XAI_API_KEY')
if (missing.length) {
  console.error('❌ Ontbrekende env:', missing.join(', '))
  process.exit(1)
}
if (!existsSync(RUN_ONE)) {
  console.error('❌ Pipeline ontbreekt:', RUN_ONE)
  process.exit(1)
}

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

async function upload(path, buf, contentType) {
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`storage ${path}: ${error.message}`)
}

async function processOne(code) {
  console.log(`\n=== ${code} ===`)
  const { data: prod } = await sb
    .from('nieuwkoop_products')
    .select('description')
    .eq('itemcode', code)
    .maybeSingle()
  console.log('  ', prod?.description || code)

  if (DRY) {
    console.log('  [dry-run] zou combinatie-stijl pipeline draaien (studio-v2 + Grok + fotoset)')
    return 'dry'
  }

  const work = mkdtempSync(join(tmpdir(), `stera-foto-${code}-`))
  try {
    const args = [RUN_ONE, `--out=${work}`, code]
    if (FORCE_AI) args.splice(1, 0, '--force-ai')
    execFileSync(process.execPath, args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
      cwd: PIPELINE,
      timeout: 300_000,
    })

    const studioFile = join(work, `studio-final-${code}.png`)
    const detailFile = join(work, `detail-${code}.png`)
    const maatFile = join(work, `maat-${code}.png`)
    for (const f of [studioFile, detailFile, maatFile]) {
      if (!existsSync(f)) throw new Error(`Output ontbreekt: ${f}`)
    }

    const studioPath = `studio/${code}.png`
    const detailPath = `detail/${code}.png`
    const maatPath = `maat/${code}.png`
    await upload(studioPath, readFileSync(studioFile), 'image/png')
    await upload(detailPath, readFileSync(detailFile), 'image/png')
    await upload(maatPath, readFileSync(maatFile), 'image/png')

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
    console.log('  ✓ combinatie-stijl set → Storage', studioPath)
    return 'ok'
  } finally {
    try {
      rmSync(work, { recursive: true, force: true })
    } catch {
      /* */
    }
  }
}

console.log('='.repeat(60))
console.log('Foto-pipeline (combinatie-stijl: studio-v2 + Grok + fotoset)')
console.log('='.repeat(60))
console.log('Dry-run:       ', DRY)
console.log('Force:         ', FORCE)
console.log('Force AI:      ', FORCE_AI)
console.log('Mark optimized:', MARK_OPT)
console.log('Limit:         ', LIMIT || 'geen')

let codes = explicitCodes
if (!codes.length) {
  const { data: offered, error } = await sb
    .from('shopify_offered_items')
    .select('itemcode')
    .eq('offered', true)
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  codes = (offered || []).map((r) => r.itemcode)
  if (!FORCE && codes.length) {
    const { data: enr } = await sb
      .from('product_enrichment')
      .select('itemcode, optimized')
      .in('itemcode', codes)
    const by = new Map((enr || []).map((e) => [e.itemcode, e]))
    codes = codes.filter((c) => !by.get(c)?.optimized)
  }
}
if (LIMIT > 0) codes = codes.slice(0, LIMIT)
console.log(`\nTe verwerken: ${codes.length}`)

if (!codes.length) {
  console.log('Niets te doen.')
  process.exit(0)
}

let ok = 0
let fail = 0
for (const code of codes) {
  try {
    await processOne(code)
    ok++
  } catch (e) {
    fail++
    console.error(`  ❌ ${code}:`, e instanceof Error ? e.message : e)
  }
  if (SLEEP_MS && codes.indexOf(code) < codes.length - 1) {
    await new Promise((r) => setTimeout(r, SLEEP_MS))
  }
}

console.log('\n' + '='.repeat(60))
console.log(`Klaar. ok=${ok} fail=${fail}`)
console.log('Pipeline = build-studio-v2.py + Grok + maak-fotoset.py (zelfde als combis)')
console.log('='.repeat(60))
process.exit(fail ? 1 : 0)
