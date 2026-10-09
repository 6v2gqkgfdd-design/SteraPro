/**
 * Dagelijkse voorraad Supabase → Shopify.
 *
 * Dry-run tenzij SHOPIFY_INVENTORY_SYNC_LIVE=1.
 * Schrijft aantallen op de winkellocatie, zet tracking aan en inventoryPolicy
 * DENY, spiegelt zero_since naar stera.oos_sinds, en haalt na 14 dagen op 0
 * alleen de Online Store-publicatie weg.
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getShopifyAdminToken } from '@/lib/shopify-admin'
import {
  DETAIL_LIMIT,
  OOS_METAFIELD_KEY,
  OOS_METAFIELD_NAMESPACE,
  SHOP_LOCATION_ID,
  brusselsDate,
  buildCounts,
  decideProducts,
  decideSku,
  detailRows,
  evaluateGuards,
  sourceIsFresh,
  type CatalogStock,
  type DetailRow,
  type ProductDecision,
  type SavedStockState,
  type ShopifyVariantSnap,
  type SkuDecision,
  type SyncCounts,
} from '@/lib/shopify-inventory-plan'

const PAGE = 1000
const VARIANT_PAGE = 50
const QTY_BATCH = 100
const META_BATCH = 25

type DbError = { message: string; code?: string; details?: string; hint?: string }

export type Graphql = (
  query: string,
  variables: Record<string, unknown>
) => Promise<unknown>

export type InventorySyncReport = {
  ok: boolean
  dry_run: boolean
  writes: boolean
  location_id: string
  today: string
  source: {
    stock_synced_at: string | null
    stock_fresh: boolean
    catalog_synced_at: string | null
    catalog_fresh: boolean
    state_table: boolean
    report_table: boolean
  }
  guard: {
    blocked: boolean
    reasons: string[]
    newly_zero_ratio: number
    newly_discontinued_ratio: number
  }
  counts: SyncCounts
  details: {
    zero_new: DetailRow[]
    oos_1_13: DetailRow[]
    hidden_today: DetailRow[]
    restored: DetailRow[]
    unmatched: DetailRow[]
    errors: string[]
  }
  status_unchanged: true
  report_persisted: boolean
  report_persist_error: string | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function idempotencyKey(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function isMissingRelation(error: DbError | null): boolean {
  if (!error) return false
  const msg = `${error.message} ${error.details ?? ''} ${error.hint ?? ''}`
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /schema cache|does not exist|could not find the table/i.test(msg)
  )
}

function latestIso(rows: { synced_at?: string | null }[]): string | null {
  let latest: string | null = null
  for (const row of rows) {
    if (!row.synced_at) continue
    if (!latest || row.synced_at > latest) latest = row.synced_at
  }
  return latest
}

async function fetchAll(
  supabase: SupabaseClient,
  table: string,
  columns: string
): Promise<{ rows: Record<string, unknown>[]; missing: boolean }> {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1)
    if (error) {
      if (isMissingRelation(error)) return { rows: [], missing: true }
      throw new Error(`${table}: ${error.message}`)
    }
    const batch = (data ?? []) as unknown as Record<string, unknown>[]
    rows.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
  }
  return { rows, missing: false }
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function str(value: unknown): string | null {
  if (value == null) return null
  const s = String(value)
  return s.length ? s : null
}

export async function createShopifyGraphql(): Promise<Graphql> {
  const { shop, token, apiVersion } = await getShopifyAdminToken()
  const url = `https://${shop}/admin/api/${apiVersion}/graphql.json`
  return async function graphql(query, variables, attempt = 1): Promise<unknown> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    })
    if (res.status === 429 && attempt <= 6) {
      await sleep(1000 * attempt)
      return graphql(query, variables, attempt + 1)
    }
    const json = (await res.json()) as {
      data?: unknown
      errors?: { message?: string }[]
    }
    const throttled = json.errors?.some((e) => /throttl/i.test(e.message || ''))
    if (throttled && attempt <= 6) {
      await sleep(1000 * attempt)
      return graphql(query, variables, attempt + 1)
    }
    if (!res.ok || json.errors?.length) {
      const msg = json.errors?.map((e) => e.message).filter(Boolean).join('; ')
      throw new Error(msg || `Shopify HTTP ${res.status}`)
    }
    return json.data
  }
}

const PUBLICATIONS = `query {
  publications(first: 30) { nodes { id name } }
}`

function variantQuery(withPublication: boolean, withInventory: boolean): string {
  const published = withPublication
    ? 'publishedOnPublication(publicationId: $publicationId)'
    : ''
  const pubVar = withPublication ? ', $publicationId: ID!' : ''
  const level = withInventory
    ? `inventoryLevel(locationId: $locationId) {
            quantities(names: ["available"]) { name quantity }
          }`
    : ''
  const locationVar = withInventory ? ', $locationId: ID!' : ''
  return `query Variants($cursor: String${locationVar}${pubVar}) {
    productVariants(first: ${VARIANT_PAGE}, after: $cursor) {
      nodes {
        id
        sku
        inventoryPolicy
        inventoryItem { id tracked ${level} }
        product {
          id
          title
          status
          ${published}
          metafield(namespace: "${OOS_METAFIELD_NAMESPACE}", key: "${OOS_METAFIELD_KEY}") { value }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`
}

const INVENTORY_SET = `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    userErrors { code field message }
  }
}`

const INVENTORY_ACTIVATE = `mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!, $available: Int, $idempotencyKey: String!) {
  inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available) @idempotent(key: $idempotencyKey) {
    inventoryLevel { id }
    userErrors { message }
  }
}`

const VARIANTS_UPDATE = `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id }
    userErrors { field message }
  }
}`

const META_SET = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id }
    userErrors { field message }
  }
}`

const META_DELETE = `mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) {
    deletedMetafields { key }
    userErrors { field message }
  }
}`

const UNPUBLISH = `mutation publishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
  publishableUnpublish(id: $id, input: $input) {
    userErrors { field message }
  }
}`

const PUBLISH = `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) {
    userErrors { field message }
  }
}`

type VariantNode = {
  id?: string
  sku?: string | null
  inventoryPolicy?: string | null
  inventoryItem?: {
    id?: string
    tracked?: boolean
    inventoryLevel?: { quantities?: { name?: string; quantity?: number }[] } | null
  } | null
  product?: {
    id?: string
    title?: string
    status?: string
    publishedOnPublication?: boolean
    metafield?: { value?: string | null } | null
  } | null
}

async function loadVariants(
  graphql: Graphql,
  publicationId: string | null,
  withInventory: boolean
): Promise<ShopifyVariantSnap[]> {
  const out: ShopifyVariantSnap[] = []
  let cursor: string | null = null
  const query = variantQuery(Boolean(publicationId), withInventory)
  for (let page = 0; page < 200; page++) {
    const data = (await graphql(query, {
      cursor,
      ...(withInventory ? { locationId: SHOP_LOCATION_ID } : {}),
      ...(publicationId ? { publicationId } : {}),
    })) as {
      productVariants?: {
        nodes?: VariantNode[]
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
      }
    }
    const nodes = data.productVariants?.nodes ?? []
    for (const node of nodes) {
      const sku = (node.sku || '').trim()
      if (!sku || !node.id || !node.product?.id) continue
      const level = node.inventoryItem?.inventoryLevel
      const available = level?.quantities?.find((q) => q.name === 'available')?.quantity
      out.push({
        sku,
        title: node.product.title || sku,
        productId: node.product.id,
        variantId: node.id,
        inventoryItemId: node.inventoryItem?.id ?? null,
        shopifyQty: level ? num(available) ?? 0 : null,
        tracked: node.inventoryItem?.tracked === true,
        inventoryPolicy: node.inventoryPolicy || '',
        publishedOnline: publicationId ? node.product.publishedOnPublication === true : false,
        metafieldOos: str(node.product.metafield?.value),
        productStatus: node.product.status ?? null,
      })
    }
    if (!data.productVariants?.pageInfo?.hasNextPage) return out
    cursor = data.productVariants.pageInfo.endCursor ?? null
    if (!cursor) return out
    await sleep(40)
  }
  throw new Error('Shopify-varianten afgekapt na 200 pagina’s — sync gestopt om een gedeeltelijk beeld te vermijden.')
}

function userErrorText(data: unknown, field: string): string[] {
  const root = data as Record<string, { userErrors?: { message?: string; code?: string }[] } | undefined>
  const errs = root?.[field]?.userErrors ?? []
  return errs.map((e) => [e.code, e.message].filter(Boolean).join(': ')).filter(Boolean)
}

async function applyWrites(input: {
  graphql: Graphql
  today: string
  publicationId: string | null
  skus: SkuDecision[]
  products: ProductDecision[]
  errors: string[]
}): Promise<{ failedSkus: Set<string>; failedProducts: Set<string> }> {
  const failedSkus = new Set<string>()
  const failedProducts = new Set<string>()
  const matched = input.skus.filter((s) => s.matched && s.inventoryItemId)

  for (const sku of matched.filter((s) => s.activate)) {
    const data = await input.graphql(INVENTORY_ACTIVATE, {
      inventoryItemId: sku.inventoryItemId,
      locationId: SHOP_LOCATION_ID,
      available: sku.targetQty,
      idempotencyKey: idempotencyKey(`activate|${input.today}|${sku.inventoryItemId}|${sku.targetQty}`),
    })
    const errs = userErrorText(data, 'inventoryActivate')
    if (errs.length) {
      failedSkus.add(sku.sku)
      input.errors.push(`${sku.sku}: ${errs.join('; ')}`)
    }
    await sleep(80)
  }

  const qtyRows = matched.filter((s) => s.setQty && !s.activate && !failedSkus.has(s.sku))
  for (let i = 0; i < qtyRows.length; i += QTY_BATCH) {
    const batch = qtyRows.slice(i, i + QTY_BATCH)
    const seed = batch
      .map((s) => `${s.inventoryItemId}:${s.shopifyQty}->${s.targetQty}`)
      .join('|')
    const data = await input.graphql(INVENTORY_SET, {
      idempotencyKey: idempotencyKey(`set|${input.today}|${seed}`),
      input: {
        name: 'available',
        reason: 'correction',
        referenceDocumentUri: `gid://stera/StockSync/${input.today}`,
        quantities: batch.map((s) => ({
          inventoryItemId: s.inventoryItemId,
          locationId: SHOP_LOCATION_ID,
          quantity: s.targetQty,
          changeFromQuantity: s.shopifyQty,
        })),
      },
    })
    const errs = userErrorText(data, 'inventorySetQuantities')
    if (errs.length) {
      for (const sku of batch) failedSkus.add(sku.sku)
      input.errors.push(`voorraadbatch: ${errs.join('; ')}`)
    }
    await sleep(120)
  }

  const policyByProduct = new Map<string, SkuDecision[]>()
  for (const sku of matched) {
    if ((!sku.setPolicyDeny && !sku.setTracked) || failedSkus.has(sku.sku)) continue
    const list = policyByProduct.get(sku.productId) ?? []
    list.push(sku)
    policyByProduct.set(sku.productId, list)
  }
  for (const [productId, list] of policyByProduct) {
    const data = await input.graphql(VARIANTS_UPDATE, {
      productId,
      variants: list.map((sku) => {
        const variant: Record<string, unknown> = { id: sku.variantId }
        if (sku.setPolicyDeny) variant.inventoryPolicy = 'DENY'
        if (sku.setTracked) variant.inventoryItem = { tracked: true }
        return variant
      }),
    })
    const errs = userErrorText(data, 'productVariantsBulkUpdate')
    if (errs.length) {
      for (const sku of list) failedSkus.add(sku.sku)
      input.errors.push(`${list[0]?.sku ?? productId}: ${errs.join('; ')}`)
    }
    await sleep(80)
  }

  const toSet = input.products.filter((p) => p.metafield === 'set' && p.metafieldValue)
  for (let i = 0; i < toSet.length; i += META_BATCH) {
    const batch = toSet.slice(i, i + META_BATCH)
    const data = await input.graphql(META_SET, {
      metafields: batch.map((p) => ({
        ownerId: p.productId,
        namespace: OOS_METAFIELD_NAMESPACE,
        key: OOS_METAFIELD_KEY,
        type: 'date',
        value: p.metafieldValue,
      })),
    })
    const errs = userErrorText(data, 'metafieldsSet')
    if (errs.length) {
      for (const p of batch) failedProducts.add(p.productId)
      input.errors.push(`metafield: ${errs.join('; ')}`)
    }
  }
  const toClear = input.products.filter((p) => p.metafield === 'clear')
  for (let i = 0; i < toClear.length; i += META_BATCH) {
    const batch = toClear.slice(i, i + META_BATCH)
    const data = await input.graphql(META_DELETE, {
      metafields: batch.map((p) => ({
        ownerId: p.productId,
        namespace: OOS_METAFIELD_NAMESPACE,
        key: OOS_METAFIELD_KEY,
      })),
    })
    const errs = userErrorText(data, 'metafieldsDelete')
    if (errs.length) {
      for (const p of batch) failedProducts.add(p.productId)
      input.errors.push(`metafield wissen: ${errs.join('; ')}`)
    }
  }

  if (input.publicationId) {
    for (const product of input.products) {
      if (!product.unpublish && !product.republish) continue
      const query = product.unpublish ? UNPUBLISH : PUBLISH
      const field = product.unpublish ? 'publishableUnpublish' : 'publishablePublish'
      const data = await input.graphql(query, {
        id: product.productId,
        input: [{ publicationId: input.publicationId }],
      })
      const errs = userErrorText(data, field)
      if (errs.length) {
        failedProducts.add(product.productId)
        input.errors.push(`${product.title}: ${errs.join('; ')}`)
      }
      await sleep(80)
    }
  }

  return { failedSkus, failedProducts }
}

export async function runShopifyInventorySync(opts: {
  supabase: SupabaseClient
  graphql?: Graphql
  now?: Date
  live?: boolean
  acknowledgeAnomaly?: boolean
}): Promise<InventorySyncReport> {
  const now = opts.now ?? new Date()
  const today = brusselsDate(now)
  const live = opts.live ?? process.env.SHOPIFY_INVENTORY_SYNC_LIVE === '1'
  const acknowledgeAnomaly =
    opts.acknowledgeAnomaly ?? process.env.SHOPIFY_INVENTORY_SYNC_ACK_GUARDS === '1'
  const errors: string[] = []

  const [productsRes, stockRes, stateRes] = await Promise.all([
    fetchAll(
      opts.supabase,
      'nieuwkoop_products',
      'itemcode, description, discontinued_at, is_active_at_source, synced_at'
    ),
    fetchAll(opts.supabase, 'nieuwkoop_stock', 'itemcode, stock_available, synced_at'),
    fetchAll(
      opts.supabase,
      'shopify_stock_state',
      'itemcode, last_qty, zero_since, hidden_at, hidden_reason, last_synced_at'
    ),
  ])

  const catalog = new Map<string, CatalogStock>()
  for (const row of productsRes.rows) {
    const itemcode = str(row.itemcode)
    if (!itemcode) continue
    catalog.set(itemcode, {
      itemcode,
      title: str(row.description),
      discontinued: Boolean(row.discontinued_at) || row.is_active_at_source === false,
      discontinuedAt: str(row.discontinued_at),
      stockAvailable: null,
    })
  }
  for (const row of stockRes.rows) {
    const itemcode = str(row.itemcode)
    if (!itemcode) continue
    const existing = catalog.get(itemcode)
    if (existing) existing.stockAvailable = num(row.stock_available)
  }
  const state = new Map<string, SavedStockState>()
  for (const row of stateRes.rows) {
    const itemcode = str(row.itemcode)
    if (!itemcode) continue
    const reason = row.hidden_reason
    state.set(itemcode, {
      lastQty: num(row.last_qty),
      zeroSince: str(row.zero_since),
      hiddenAt: str(row.hidden_at),
      hiddenReason: reason === 'oos_14d' || reason === 'discontinued' ? reason : null,
      lastSyncedAt: str(row.last_synced_at),
    })
  }

  const stockSyncedAt = latestIso(stockRes.rows as { synced_at?: string | null }[])
  const catalogSyncedAt = latestIso(productsRes.rows as { synced_at?: string | null }[])
  const stockFresh = sourceIsFresh(stockSyncedAt, today)
  const catalogFresh = sourceIsFresh(catalogSyncedAt, today)

  const graphql = opts.graphql ?? (await createShopifyGraphql())
  let publicationId: string | null = null
  try {
    const pubData = (await graphql(PUBLICATIONS, {})) as {
      publications?: { nodes?: { id?: string; name?: string }[] }
    }
    publicationId =
      pubData.publications?.nodes?.find((n) => /online store/i.test(n.name || ''))?.id ?? null
    if (!publicationId) {
      errors.push('Online Store-publicatie niet gevonden. Publicaties worden niet aangepast.')
    }
  } catch (e) {
    errors.push(
      `Publicaties lezen mislukt (${e instanceof Error ? e.message : 'onbekend'}). Publicaties worden niet aangepast.`
    )
  }

  let inventoryKnown = true
  let variants: ShopifyVariantSnap[]
  try {
    variants = await loadVariants(graphql, publicationId, true)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'onbekend'
    if (!/inventory|access denied|publication|scope|not approved|throttl/i.test(msg)) throw e
    inventoryKnown = false
    errors.push(
      `Shopify-voorraad niet gelezen (${msg}). Drempels gebruiken alleen Supabase; er wordt niet geschreven.`
    )
    try {
      variants = await loadVariants(graphql, publicationId, false)
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : 'onbekend'
      errors.push(`Publicatiestatus niet gelezen (${msg2}).`)
      publicationId = null
      variants = await loadVariants(graphql, null, false)
    }
  }
  const skus = variants.map((variant) =>
    decideSku(variant, catalog.get(variant.sku), state.get(variant.sku), today)
  )
  if (!inventoryKnown) {
    for (const sku of skus) {
      sku.setQty = false
      sku.activate = false
      sku.setPolicyDeny = false
      sku.setTracked = false
    }
  }
  for (const sku of skus) {
    if (sku.matched && !sku.inventoryItemId) {
      errors.push(`${sku.sku}: geen inventory item, aantal niet te zetten.`)
    }
  }
  const products = decideProducts(variants, skus)
  const counts = buildCounts(skus, products, errors.length)
  const guard = evaluateGuards({
    stockFresh,
    catalogFresh,
    matched: counts.synced,
    newlyZero: counts.zero_new,
    newlyDiscontinued: skus.filter((s) => s.newlyDiscontinued).length,
    acknowledgeAnomaly,
  })
  if (!inventoryKnown) {
    guard.blocked = true
    guard.reasons.push('Geen writes: het huidige Shopify-aantal is niet gelezen.')
  }
  if (live && stateRes.missing) {
    guard.blocked = true
    guard.reasons.push(
      'shopify_stock_state ontbreekt. Migratie is nog niet toegepast, dus er wordt niet geschreven.'
    )
  }

  const hiddenToday = new Set(products.flatMap((p) => p.markHiddenSkus))
  const details = {
    zero_new: detailRows(skus, (s) => s.newlyZero),
    oos_1_13: detailRows(skus, (s) => s.oosDays1to13),
    hidden_today: detailRows(skus, (s) => hiddenToday.has(s.sku)),
    restored: detailRows(skus, (s) => s.returned),
    unmatched: skus
      .filter((s) => !s.matched)
      .slice(0, DETAIL_LIMIT)
      .map((s) => ({
        itemcode: s.sku,
        title: s.title,
        zero_since: null,
        qty: s.shopifyQty ?? 0,
        from_qty: s.shopifyQty,
      })),
    errors: errors.slice(0, DETAIL_LIMIT),
  }

  let writes = false
  if (live && !guard.blocked) {
    writes = true
    const { failedSkus, failedProducts } = await applyWrites({
      graphql,
      today,
      publicationId,
      skus,
      products,
      errors,
    })
    const nowIso = now.toISOString()
    const stateRows = skus
      .filter((s) => s.matched && !failedSkus.has(s.sku) && !failedProducts.has(s.productId))
      .map((s) => {
        const product = products.find((p) => p.productId === s.productId)
        const mark = product?.markHiddenSkus.includes(s.sku)
        const clear = product?.clearHiddenSkus.includes(s.sku)
        return {
          itemcode: s.sku,
          shopify_product_id: s.productId,
          shopify_variant_id: s.variantId,
          inventory_item_id: s.inventoryItemId,
          last_qty: s.targetQty,
          last_synced_at: nowIso,
          zero_since: s.zeroSince,
          hidden_at: mark ? nowIso : clear ? null : s.hiddenAt,
          hidden_reason: mark ? 'oos_14d' : clear ? null : s.hiddenReason,
          updated_at: nowIso,
        }
      })
    for (let i = 0; i < stateRows.length; i += 200) {
      const { error } = await opts.supabase
        .from('shopify_stock_state')
        .upsert(stateRows.slice(i, i + 200), { onConflict: 'itemcode' })
      if (error) {
        errors.push(`shopify_stock_state: ${error.message}`)
        break
      }
    }
  }

  counts.errors = errors.length
  details.errors = errors.slice(0, DETAIL_LIMIT)

  const report: InventorySyncReport = {
    ok: !guard.blocked && errors.length === 0,
    dry_run: !live,
    writes,
    location_id: SHOP_LOCATION_ID,
    today,
    source: {
      stock_synced_at: stockSyncedAt,
      stock_fresh: stockFresh,
      catalog_synced_at: catalogSyncedAt,
      catalog_fresh: catalogFresh,
      state_table: !stateRes.missing,
      report_table: true,
    },
    guard: {
      blocked: guard.blocked,
      reasons: guard.reasons,
      newly_zero_ratio: guard.newlyZeroRatio,
      newly_discontinued_ratio: guard.newlyDiscontinuedRatio,
    },
    counts,
    details,
    status_unchanged: true,
    report_persisted: false,
    report_persist_error: null,
  }

  const { error: reportError } = await opts.supabase.from('stock_sync_reports').insert({
    ok: report.ok,
    dry_run: report.dry_run,
    counts: report.counts,
    details: {
      guard: report.guard,
      source: report.source,
      zero_new: details.zero_new,
      oos_1_13: details.oos_1_13,
      hidden_today: details.hidden_today,
      restored: details.restored,
      unmatched: details.unmatched,
      errors: details.errors,
    },
  })
  if (reportError) {
    report.source.report_table = !isMissingRelation(reportError)
    report.report_persisted = false
    report.report_persist_error = isMissingRelation(reportError)
      ? 'stock_sync_reports bestaat nog niet (migratie niet toegepast).'
      : reportError.message
    if (!isMissingRelation(reportError)) {
      console.error('stock_sync_reports insert failed', reportError)
    }
  } else {
    report.report_persisted = true
  }

  if (errors.length) console.error('shopify inventory sync errors', errors.slice(0, 20))
  if (guard.blocked) console.error('shopify inventory sync blocked', guard.reasons)
  return report
}
