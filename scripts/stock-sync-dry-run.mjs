#!/usr/bin/env node
/**
 * Read-only voorraadplan.
 *
 * Met Shopify- en Supabase-credentials: leest varianten, catalogus en voorraad
 * en print het plan. Geen mutaties, geen insert in stock_sync_reports.
 * Zonder credentials: hetzelfde plan op vaste fixtures.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/stock-sync-dry-run.mjs
 *
 * Verplichte env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SHOPIFY_STORE_DOMAIN, en SHOPIFY_ADMIN_TOKEN of SHOPIFY_CLIENT_ID plus
 * SHOPIFY_CLIENT_SECRET. Optioneel: SHOPIFY_API_VERSION (standaard 2026-04),
 * SHOPIFY_INVENTORY_POTSERIE_TAG (standaard potserie-v2).
 * De run zet live en persistReport uit. Het JSON-rapport heeft writes=false.
 * counts.excluded_by_reason telt per reden, waaronder buiten_assortiment en
 * pot_draft_buiten_set. counts.updates_on_buiten_assortiment moet 0 zijn.
 */

import { parsePotserieTag, planInventorySync } from '../lib/shopify-inventory-plan.ts'

const POTSERIE_TAG = parsePotserieTag(process.env.SHOPIFY_INVENTORY_POTSERIE_TAG)

const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

function variant(over) {
  return {
    sku: 'AA',
    title: 'Plant',
    productId: 'gid://shopify/Product/1',
    variantId: 'gid://shopify/ProductVariant/1',
    inventoryItemId: 'gid://shopify/InventoryItem/1',
    shopifyQty: 4,
    tracked: true,
    inventoryPolicy: 'DENY',
    publishedOnline: true,
    metafieldOos: null,
    voorraadstatus: null,
    productStatus: 'ACTIVE',
    tags: [],
    productType: null,
    ...over,
  }
}

function catalog(over) {
  return {
    itemcode: 'AA',
    title: 'Plant',
    discontinued: false,
    discontinuedAt: null,
    stockAvailable: 0,
    ...over,
  }
}

function daysAgo(days) {
  const [year, month, day] = TODAY.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function fixturePlan() {
  const hidden = {
    lastQty: 0,
    zeroSince: daysAgo(14),
    hiddenAt: null,
    hiddenReason: null,
    lastSyncedAt: null,
  }
  const cc = catalog({
    itemcode: 'CC0060777',
    title: 'Ficus in Cinnamon',
    stockAvailable: 0,
    groupDescription: 'Combinaties',
    productGroupDescription: 'All-in-1',
  })
  const plant = catalog({
    itemcode: '6BS100',
    title: 'Ficus hydro',
    stockAvailable: 0,
    mainGroupDescription: 'Planten',
    productGroupDescription: 'Hydrocultuur',
  })
  const pot = catalog({
    itemcode: 'POT300',
    title: 'Buitenpot',
    stockAvailable: 2,
    productGroupDescription: 'Plantenbakken',
  })
  const artificial = catalog({
    itemcode: 'ART1',
    title: 'Kunstficus',
    stockAvailable: 0,
    productGroupDescription: 'Artificial plants',
    groupDescription: 'Artificial',
  })
  const archived = catalog({ itemcode: 'CCARCH', title: 'Archief', stockAvailable: 8 })
  const tagged = catalog({ itemcode: 'LEG1', title: 'Oude maat', stockAvailable: 1 })
  const serie = catalog({ itemcode: 'SERIE1', title: 'Oude serie', stockAvailable: 4 })
  const buiten = catalog({ itemcode: 'BUITEN1', title: 'Buiten assortiment', stockAvailable: 5 })
  const potDraft = catalog({ itemcode: 'POTDRAFT', title: 'Oude draftpot', stockAvailable: 3 })
  const potSet = catalog({ itemcode: 'POTSET', title: 'Nieuwe potset', stockAvailable: 7 })
  return planInventorySync({
    today: TODAY,
    publicationKnown: true,
    potserieTag: POTSERIE_TAG,
    catalog: new Map(
      [cc, plant, pot, artificial, archived, tagged, serie, buiten, potDraft, potSet].map((row) => [
        row.itemcode,
        row,
      ])
    ),
    state: new Map([
      [cc.itemcode, hidden],
      [plant.itemcode, hidden],
      [artificial.itemcode, hidden],
    ]),
    variants: [
      variant({
        sku: cc.itemcode,
        title: cc.title,
        productId: 'gid://shopify/Product/cc',
        variantId: 'gid://shopify/ProductVariant/cc-a',
        inventoryItemId: 'gid://shopify/InventoryItem/cc-a',
        shopifyQty: 3,
        inventoryPolicy: 'CONTINUE',
        productStatus: 'ACTIVE',
        publishedOnline: true,
      }),
      variant({
        sku: cc.itemcode,
        title: cc.title,
        productId: 'gid://shopify/Product/cc',
        variantId: 'gid://shopify/ProductVariant/cc-b',
        inventoryItemId: 'gid://shopify/InventoryItem/cc-b',
        shopifyQty: 3,
        inventoryPolicy: 'CONTINUE',
        productStatus: 'ACTIVE',
        publishedOnline: true,
      }),
      variant({
        sku: plant.itemcode,
        title: plant.title,
        productId: 'gid://shopify/Product/plant',
        variantId: 'gid://shopify/ProductVariant/plant',
        inventoryItemId: 'gid://shopify/InventoryItem/plant',
        shopifyQty: 0,
        inventoryPolicy: 'CONTINUE',
        productStatus: 'DRAFT',
        publishedOnline: false,
      }),
      variant({
        sku: pot.itemcode,
        title: pot.title,
        productId: 'gid://shopify/Product/pot',
        variantId: 'gid://shopify/ProductVariant/pot',
        inventoryItemId: 'gid://shopify/InventoryItem/pot',
        shopifyQty: 0,
        inventoryPolicy: 'CONTINUE',
        productStatus: 'ACTIVE',
        publishedOnline: true,
      }),
      variant({
        sku: artificial.itemcode,
        title: artificial.title,
        productId: 'gid://shopify/Product/art',
        variantId: 'gid://shopify/ProductVariant/art',
        inventoryItemId: 'gid://shopify/InventoryItem/art',
        shopifyQty: 5,
        inventoryPolicy: 'CONTINUE',
        productStatus: 'DRAFT',
        publishedOnline: false,
        tracked: false,
      }),
      variant({
        sku: archived.itemcode,
        title: archived.title,
        productId: 'gid://shopify/Product/arch',
        variantId: 'gid://shopify/ProductVariant/arch',
        productStatus: 'ARCHIVED',
        publishedOnline: false,
        shopifyQty: 8,
        inventoryPolicy: 'CONTINUE',
      }),
      variant({
        sku: tagged.itemcode,
        title: tagged.title,
        productId: 'gid://shopify/Product/leg',
        variantId: 'gid://shopify/ProductVariant/leg',
        tags: ['legacy-per-maat'],
        shopifyQty: 1,
        inventoryPolicy: 'CONTINUE',
      }),
      variant({
        sku: serie.itemcode,
        title: serie.title,
        productId: 'gid://shopify/Product/serie',
        variantId: 'gid://shopify/ProductVariant/serie',
        tags: ['legacy-serie'],
        shopifyQty: 4,
        inventoryPolicy: 'CONTINUE',
      }),
      variant({
        sku: buiten.itemcode,
        title: buiten.title,
        productId: 'gid://shopify/Product/buiten',
        variantId: 'gid://shopify/ProductVariant/buiten',
        tags: ['buiten-assortiment'],
        shopifyQty: 1,
        inventoryPolicy: 'CONTINUE',
      }),
      variant({
        sku: potDraft.itemcode,
        title: potDraft.title,
        productId: 'gid://shopify/Product/potdraft',
        variantId: 'gid://shopify/ProductVariant/potdraft',
        productType: 'Pot',
        productStatus: 'DRAFT',
        publishedOnline: false,
        shopifyQty: 0,
        inventoryPolicy: 'CONTINUE',
      }),
      variant({
        sku: potSet.itemcode,
        title: potSet.title,
        productId: 'gid://shopify/Product/potset',
        variantId: 'gid://shopify/ProductVariant/potset',
        productType: 'Pot',
        productStatus: 'DRAFT',
        tags: [POTSERIE_TAG],
        publishedOnline: false,
        shopifyQty: 1,
        inventoryPolicy: 'CONTINUE',
      }),
    ],
  })
}

function hasCredentials() {
  const names = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SHOPIFY_STORE_DOMAIN',
  ]
  const shopifyAuth =
    process.env.SHOPIFY_ADMIN_TOKEN ||
    (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)
  return names.every((name) => process.env[name]) && Boolean(shopifyAuth)
}

function summarize(planned, source) {
  const lines = planned.skus
    .filter((sku) => sku.matched)
    .map((sku) => ({
      sku: sku.sku,
      variantId: sku.variantId,
      qty: sku.targetQty,
      setQty: sku.setQty,
      deny: sku.setPolicyDeny,
      message: sku.oosMessage,
      rules: sku.zeroStockRules,
    }))
  const products = planned.products.map((product) => ({
    productId: product.productId,
    title: product.title,
    status: product.productStatus,
    published: product.publishedOnline,
    unpublish: product.unpublish,
    archive: product.archive,
    metafield: product.metafield,
  }))
  return {
    source,
    writes: false,
    dry_run: true,
    today: TODAY,
    counts: planned.counts,
    excluded_by_reason: planned.counts.excluded_by_reason,
    updates_on_buiten_assortiment: planned.counts.updates_on_buiten_assortiment,
    excluded: planned.excluded,
    products,
    variants: lines,
  }
}

async function readOnlyRemote() {
  const { register } = await import('node:module')
  const registered = register(new URL('./ts-path-loader.mjs', import.meta.url), {
    parentURL: import.meta.url,
  })
  if (registered?.promise) await registered.promise
  const { createClient } = await import('@supabase/supabase-js')
  const syncUrl = new URL('../lib/shopify-inventory-sync.ts', import.meta.url).href
  const { runShopifyInventorySync } = await import(syncUrl)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  return runShopifyInventorySync({
    supabase,
    live: false,
    persistReport: false,
  })
}

const credentialed = hasCredentials()
let report
if (credentialed) {
  try {
    report = await readOnlyRemote()
    report.source_mode = 'shopify+supabase-readonly'
    report.excluded_by_reason = report.counts?.excluded_by_reason ?? null
    report.updates_on_buiten_assortiment = report.counts?.updates_on_buiten_assortiment ?? null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/Cannot find module '@\//.test(message) && !/ERR_MODULE_NOT_FOUND/.test(message)) {
      throw error
    }
    report = summarize(fixturePlan(), 'fixtures')
    report.credential_import_error = message
  }
} else {
  report = summarize(fixturePlan(), 'fixtures')
  report.note =
    'Geen Shopify- of Supabase-credentials in deze omgeving. Dit is een dry-run op fixtures: er is niets gelezen of geschreven.'
}

console.log(JSON.stringify(report, null, 2))
