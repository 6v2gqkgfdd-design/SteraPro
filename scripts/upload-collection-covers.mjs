#!/usr/bin/env node
/**
 * Upload collectie-covers naar Shopify + herkoppel producten aan collecties.
 *   node --env-file=.env.local scripts/upload-collection-covers.mjs --live
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')
const LIVE = process.argv.includes('--live')
const SHOP = process.env.SHOPIFY_STORE_DOMAIN
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04'
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const COVERS = [
  { handle: 'kantoorhelden', file: 'kantoorhelden.jpg' },
  { handle: 'receptie-statement', file: 'receptie-statement.jpg' },
  { handle: 'palmen-workspace', file: 'palmen-workspace.jpg' },
  { handle: 'hang-cascade', file: 'hang-cascade.jpg' },
  { handle: 'designbladeren', file: 'designbladeren.jpg' },
]

async function getToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  const j = await res.json()
  if (!j.access_token) throw new Error('token failed')
  return j.access_token
}

async function gql(token, query, variables = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors).slice(0, 300))
  return json.data
}

async function stagedUpload(token, filepath, filename) {
  const buf = readFileSync(filepath)
  const size = buf.byteLength
  const mime = 'image/jpeg'

  const stage = await gql(
    token,
    `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`,
    {
      input: [
        {
          resource: 'COLLECTION_IMAGE',
          filename,
          mimeType: mime,
          httpMethod: 'POST',
          fileSize: String(size),
        },
      ],
    }
  )
  const target = stage?.stagedUploadsCreate?.stagedTargets?.[0]
  if (!target) throw new Error('no staged target')

  const form = new FormData()
  for (const p of target.parameters) form.append(p.name, p.value)
  form.append('file', new Blob([buf], { type: mime }), filename)

  const up = await fetch(target.url, { method: 'POST', body: form })
  if (!up.ok && up.status !== 201 && up.status !== 204) {
    const t = await up.text().catch(() => '')
    throw new Error(`upload ${up.status} ${t.slice(0, 200)}`)
  }
  return target.resourceUrl
}

async function main() {
  const token = await getToken()
  const report = JSON.parse(
    readFileSync(join(DIR, 'webshop-assortments-report.json'), 'utf8')
  )

  for (const cover of COVERS) {
    console.log(`\n▶ ${cover.handle}`)
    const found = await gql(
      token,
      `query ($q: String!) {
        collections(first: 3, query: $q) { nodes { id handle title } }
      }`,
      { q: `handle:${cover.handle}` }
    )
    const col = found?.collections?.nodes?.[0]
    if (!col) {
      console.warn('  collectie niet gevonden')
      continue
    }

    // Cover image
    const imgPath = join(ROOT, 'assets/collection-covers', cover.file)
    if (existsSync(imgPath) && LIVE) {
      try {
        const resourceUrl = await stagedUpload(token, imgPath, cover.file)
        await gql(
          token,
          `mutation collectionUpdate($input: CollectionInput!) {
            collectionUpdate(input: $input) {
              collection { id image { url } }
              userErrors { message }
            }
          }`,
          {
            input: {
              id: col.id,
              image: { src: resourceUrl },
            },
          }
        )
        console.log('  ✓ cover geüpload')
      } catch (e) {
        console.warn('  cover fout:', e.message)
      }
    } else if (!LIVE) {
      console.log('  [dry-run] cover', cover.file)
    }

    // Re-link products from report by SKU
    const ass = (report.report || []).find((r) => r.handle === cover.handle)
    if (!ass || !LIVE) continue
    const gids = new Set()
    for (const item of ass.items || []) {
      try {
        const data = await gql(
          token,
          `query ($q: String!) {
            productVariants(first: 5, query: $q) {
              nodes { product { id } sku }
            }
          }`,
          { q: `sku:${item.itemcode}` }
        )
        for (const v of data?.productVariants?.nodes || []) {
          if (v.product?.id) gids.add(v.product.id)
        }
      } catch {
        /* */
      }
    }
    const productIds = [...gids]
    console.log(`  producten gevonden: ${productIds.length}`)
    if (productIds.length) {
      for (let i = 0; i < productIds.length; i += 50) {
        const chunk = productIds.slice(i, i + 50)
        await gql(
          token,
          `mutation ($id: ID!, $productIds: [ID!]!) {
            collectionAddProducts(id: $id, productIds: $productIds) {
              userErrors { message }
            }
          }`,
          { id: col.id, productIds: chunk }
        )
      }
      console.log('  ✓ producten gekoppeld')
    }
  }

  // Verify offered count
  if (SUPA_URL && SUPA_KEY) {
    const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })
    const { count } = await sb
      .from('shopify_offered_items')
      .select('*', { count: 'exact', head: true })
      .eq('offered', true)
    console.log(`\nAangeboden in catalogus: ${count}`)
  }
  console.log('Klaar.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
