#!/usr/bin/env node
/**
 * Pre-check welke artikels in nieuwkoop_products effectief een
 * foto hebben bij de leverancier. Schrijft het resultaat in
 * has_image + image_checked_at.
 *
 * Run:
 *   node --env-file=.env.local check-image-availability.mjs
 *   node --env-file=.env.local check-image-availability.mjs --all
 *
 * --all forceert hercheck van alle items (anders enkel die met
 * image_checked_at = null).
 *
 * Vereiste env vars:
 *   NIEUWKOOP_API_BASE_URL, NIEUWKOOP_API_USER, NIEUWKOOP_API_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const NK_BASE = process.env.NIEUWKOOP_API_BASE_URL
const NK_USER = process.env.NIEUWKOOP_API_USER
const NK_PASS = process.env.NIEUWKOOP_API_PASSWORD
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!NK_BASE || !NK_USER || !NK_PASS || !SUPA_URL || !SUPA_SERVICE_KEY) {
  console.error('Ontbrekende env vars. Run met --env-file=.env.local.')
  process.exit(1)
}

const supabase = createClient(SUPA_URL, SUPA_SERVICE_KEY, {
  auth: { persistSession: false },
})

const auth =
  'Basic ' + Buffer.from(`${NK_USER}:${NK_PASS}`).toString('base64')

const CONCURRENCY = 8
const BATCH_SIZE = 100

/** true = foto bestaat, false = 404, null = onbekend (fout/timeout). */
async function checkOne(itemcode) {
  const url = `${NK_BASE}/items/${encodeURIComponent(itemcode)}/image`
  try {
    const res = await fetch(url, {
      headers: { Authorization: auth, Accept: 'application/json' },
    })
    if (res.status === 404) return false
    if (!res.ok) return null
    const body = await res.json()
    if (typeof body?.Image === 'string' && body.Image.length > 100) {
      return true
    }
    return false
  } catch (err) {
    console.error(`\n  ! ${itemcode}: ${err.message}`)
    return null
  }
}

async function runInParallel(items, fn, concurrency) {
  const results = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

async function main() {
  const recheckAll = process.argv.includes('--all')

  console.log('Items ophalen...')
  let query = supabase
    .from('nieuwkoop_products')
    .select('itemcode')
    .not('item_picture_name', 'is', null)
    .neq('item_picture_name', '')
    .limit(50000)

  if (!recheckAll) {
    query = query.is('image_checked_at', null)
  }

  const { data: items, error } = await query
  if (error) {
    console.error('Items ophalen mislukt:', error)
    process.exit(1)
  }

  console.log(
    `Te checken: ${items?.length ?? 0}${recheckAll ? ' (--all)' : ''}`
  )
  if (!items || items.length === 0) {
    console.log('Niets te doen. Klaar.')
    return
  }

  let done = 0
  let trueCount = 0
  let falseCount = 0
  let unknownCount = 0

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const results = await runInParallel(
      batch,
      (it) => checkOne(it.itemcode),
      CONCURRENCY
    )

    const now = new Date().toISOString()
    const trueCodes = []
    const falseCodes = []
    const nullCodes = []
    for (let j = 0; j < batch.length; j++) {
      const code = batch[j].itemcode
      const r = results[j]
      if (r === true) trueCodes.push(code)
      else if (r === false) falseCodes.push(code)
      else nullCodes.push(code)
    }

    // 3 bulk-updates per batch — sneller dan per item.
    const ops = []
    if (trueCodes.length > 0) {
      ops.push(
        supabase
          .from('nieuwkoop_products')
          .update({ has_image: true, image_checked_at: now })
          .in('itemcode', trueCodes)
      )
    }
    if (falseCodes.length > 0) {
      ops.push(
        supabase
          .from('nieuwkoop_products')
          .update({ has_image: false, image_checked_at: now })
          .in('itemcode', falseCodes)
      )
    }
    if (nullCodes.length > 0) {
      // Onbekend: enkel image_checked_at zetten zodat we niet
      // oneindig blijven herchecken; has_image laten we ongemoeid.
      ops.push(
        supabase
          .from('nieuwkoop_products')
          .update({ image_checked_at: now })
          .in('itemcode', nullCodes)
      )
    }
    const results2 = await Promise.all(ops)
    for (const r of results2) {
      if (r.error) console.error('\n  ! update fout:', r.error.message)
    }

    trueCount += trueCodes.length
    falseCount += falseCodes.length
    unknownCount += nullCodes.length
    done += batch.length

    process.stdout.write(
      `\r  ${done}/${items.length}  ✓${trueCount}  ✗${falseCount}  ?${unknownCount}`
    )
  }

  console.log('\nKlaar.')
}

main().catch((err) => {
  console.error('Onverwachte fout:', err)
  process.exit(1)
})
