/**
 * Beslissingen voor de dagelijkse Supabase → Shopify voorraad-sync.
 * Puur: geen netwerk. De runner past dit toe, of stopt bij een dry-run.
 *
 * Een product dat op 0 valt blijft staan (qty 0, tracking aan, DENY).
 * Na 14 opeenvolgende dagen op 0 verdwijnt alleen de Online Store-publicatie.
 * Terug op voorraad → opnieuw publiceren, enkel als déze job het verborg.
 */

export const SHOP_LOCATION_ID = 'gid://shopify/Location/110900904317'
export const OOS_METAFIELD_NAMESPACE = 'stera'
export const OOS_METAFIELD_KEY = 'oos_sinds'
export const STOCK_CAP = 100
export const HIDE_AFTER_ELAPSED_DAYS = 14
export const NEWLY_ZERO_ABORT_RATIO = 0.2
export const NEWLY_DISCONTINUED_ABORT_RATIO = 0.05
export const DETAIL_LIMIT = 40

export type HiddenReason = 'oos_14d' | 'discontinued'

export type CatalogStock = {
  itemcode: string
  title: string | null
  discontinued: boolean
  discontinuedAt: string | null
  stockAvailable: number | null
}

export type SavedStockState = {
  lastQty: number | null
  zeroSince: string | null
  hiddenAt: string | null
  hiddenReason: HiddenReason | null
  lastSyncedAt: string | null
}

export type ShopifyVariantSnap = {
  sku: string
  title: string
  productId: string
  variantId: string
  inventoryItemId: string | null
  /** null = geen voorraadniveau op de winkellocatie */
  shopifyQty: number | null
  tracked: boolean
  inventoryPolicy: string
  publishedOnline: boolean
  metafieldOos: string | null
  productStatus: string | null
}

export type SkuDecision = {
  sku: string
  title: string
  productId: string
  variantId: string
  inventoryItemId: string | null
  matched: boolean
  discontinued: boolean
  targetQty: number
  shopifyQty: number | null
  previousQty: number | null
  setQty: boolean
  activate: boolean
  setPolicyDeny: boolean
  setTracked: boolean
  zeroSince: string | null
  previousZeroSince: string | null
  hiddenAt: string | null
  hiddenReason: HiddenReason | null
  oosElapsedDays: number | null
  newlyZero: boolean
  newlyDiscontinued: boolean
  returned: boolean
  inStock: boolean
  atZero: boolean
  oosDays1to13: boolean
}

export type ProductDecision = {
  productId: string
  title: string
  unpublish: boolean
  republish: boolean
  metafield: 'set' | 'clear' | 'keep'
  metafieldValue: string | null
  /** SKUs waarvan hidden_at gezet wordt omdat we nu unpublishen. */
  markHiddenSkus: string[]
  /** SKUs waarvan hidden_at gewist wordt omdat we nu republishen. */
  clearHiddenSkus: string[]
}

export type GuardResult = {
  blocked: boolean
  reasons: string[]
  newlyZeroRatio: number
  newlyDiscontinuedRatio: number
}

export type DetailRow = {
  itemcode: string
  title: string
  zero_since: string | null
  qty: number
  from_qty: number | null
}

export type SyncCounts = {
  synced: number
  with_stock: number
  at_zero: number
  zero_new: number
  oos_1_13: number
  hidden_14d_today: number
  hidden_total: number
  restored: number
  errors: number
  unmatched: number
  qty_set: number
  policy_deny: number
  track_on: number
  activate: number
  unpublish: number
  republish: number
  metafield_set: number
  metafield_clear: number
}

export function brusselsDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function calendarDaysBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`)
  const b = Date.parse(`${toDate}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

export function targetQuantity(discontinued: boolean, stockAvailable: number | null): number {
  if (discontinued) return 0
  if (stockAvailable == null || !Number.isFinite(stockAvailable)) return 0
  return Math.min(STOCK_CAP, Math.max(0, Math.floor(stockAvailable)))
}

export function isSameBrusselsDay(iso: string | null | undefined, today: string): boolean {
  if (!iso) return false
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return false
  return brusselsDate(parsed) === today
}

export function sourceIsFresh(latestSyncedAt: string | null | undefined, today: string): boolean {
  return isSameBrusselsDay(latestSyncedAt, today)
}

function previousQuantity(
  state: SavedStockState | undefined,
  shopifyQty: number | null
): number | null {
  if (state && state.lastQty != null && Number.isFinite(state.lastQty)) return state.lastQty
  if (shopifyQty != null && Number.isFinite(shopifyQty)) return shopifyQty
  return null
}

export function decideSku(
  variant: ShopifyVariantSnap,
  catalog: CatalogStock | undefined,
  state: SavedStockState | undefined,
  today: string
): SkuDecision {
  const matched = Boolean(catalog)
  const discontinued = catalog?.discontinued === true
  const targetQty = matched ? targetQuantity(discontinued, catalog?.stockAvailable ?? null) : 0
  const prev = previousQuantity(state, variant.shopifyQty)
  const previousZeroSince = state?.zeroSince ?? null
  let zeroSince: string | null = null
  if (matched && targetQty === 0) zeroSince = previousZeroSince ?? today

  const oosElapsedDays =
    matched && zeroSince ? calendarDaysBetween(zeroSince, today) : null

  return {
    sku: variant.sku,
    title: catalog?.title || variant.title,
    productId: variant.productId,
    variantId: variant.variantId,
    inventoryItemId: variant.inventoryItemId,
    matched,
    discontinued,
    targetQty: matched ? targetQty : variant.shopifyQty ?? 0,
    shopifyQty: variant.shopifyQty,
    previousQty: prev,
    setQty: matched && variant.inventoryItemId != null && variant.shopifyQty !== targetQty,
    activate: matched && variant.inventoryItemId != null && variant.shopifyQty == null,
    setPolicyDeny: matched && variant.inventoryPolicy !== 'DENY',
    setTracked: matched && variant.tracked !== true,
    zeroSince,
    previousZeroSince,
    hiddenAt: state?.hiddenAt ?? null,
    hiddenReason: state?.hiddenReason ?? null,
    oosElapsedDays,
    newlyZero: matched && targetQty === 0 && prev != null && prev > 0,
    newlyDiscontinued:
      matched && discontinued && isSameBrusselsDay(catalog?.discontinuedAt, today),
    returned:
      matched &&
      targetQty > 0 &&
      ((prev != null && prev <= 0) ||
        previousZeroSince != null ||
        state?.hiddenReason === 'oos_14d'),
    inStock: matched && targetQty > 0,
    atZero: matched && targetQty === 0,
    oosDays1to13:
      matched &&
      targetQty === 0 &&
      oosElapsedDays != null &&
      oosElapsedDays >= 1 &&
      oosElapsedDays <= 13,
  }
}

/**
 * Publicatie is product-niveau. Een product met nog één variant op voorraad
 * blijft online. Unpublish pas als élke gematchte variant 14 dagen op 0 staat
 * en het product nog op Online Store staat. Republish enkel als wij het
 * verborgen hebben (hidden_reason oos_14d) en er weer voorraad is.
 */
export function decideProducts(
  variants: ShopifyVariantSnap[],
  skus: SkuDecision[]
): ProductDecision[] {
  const variantsByProduct = new Map<string, ShopifyVariantSnap[]>()
  for (const variant of variants) {
    const list = variantsByProduct.get(variant.productId) ?? []
    list.push(variant)
    variantsByProduct.set(variant.productId, list)
  }
  const skusByProduct = new Map<string, SkuDecision[]>()
  for (const sku of skus) {
    if (!sku.matched) continue
    const list = skusByProduct.get(sku.productId) ?? []
    list.push(sku)
    skusByProduct.set(sku.productId, list)
  }

  const out: ProductDecision[] = []
  for (const [productId, matched] of skusByProduct) {
    const snaps = variantsByProduct.get(productId) ?? []
    const title = snaps[0]?.title || matched[0].title
    const published = snaps.some((v) => v.publishedOnline)
    const allZero = matched.every((s) => s.atZero)
    const anyStock = matched.some((s) => s.inStock)
    const readyToHide =
      allZero &&
      matched.every(
        (s) => s.oosElapsedDays != null && s.oosElapsedDays >= HIDE_AFTER_ELAPSED_DAYS
      )
    const hiddenByUs = matched.filter((s) => s.hiddenAt && s.hiddenReason === 'oos_14d')

    const unpublish = published && readyToHide
    const republish = anyStock && hiddenByUs.length > 0

    const earliestZero =
      matched
        .map((s) => s.zeroSince)
        .filter((d): d is string => Boolean(d))
        .sort()[0] ?? null
    const currentMeta = snaps.find((v) => v.metafieldOos)?.metafieldOos ?? null

    let metafield: ProductDecision['metafield'] = 'keep'
    let metafieldValue: string | null = null
    if (anyStock) {
      if (currentMeta) metafield = 'clear'
    } else if (allZero && earliestZero && currentMeta !== earliestZero) {
      metafield = 'set'
      metafieldValue = earliestZero
    }

    out.push({
      productId,
      title,
      unpublish,
      republish,
      metafield,
      metafieldValue,
      markHiddenSkus: unpublish
        ? matched.filter((s) => !(s.hiddenAt && s.hiddenReason === 'oos_14d')).map((s) => s.sku)
        : [],
      clearHiddenSkus: republish ? hiddenByUs.map((s) => s.sku) : [],
    })
  }
  return out
}

export function evaluateGuards(input: {
  stockFresh: boolean
  catalogFresh: boolean
  matched: number
  newlyZero: number
  newlyDiscontinued: number
  acknowledgeAnomaly: boolean
}): GuardResult {
  const newlyZeroRatio = input.matched > 0 ? input.newlyZero / input.matched : 0
  const newlyDiscontinuedRatio =
    input.matched > 0 ? input.newlyDiscontinued / input.matched : 0
  const reasons: string[] = []
  if (!input.stockFresh) {
    reasons.push('Bronverouderd: de Nieuwkoop-voorraad is vandaag niet gesynchroniseerd.')
  }
  if (!input.catalogFresh) {
    reasons.push('Bronverouderd: de Nieuwkoop-catalogus is vandaag niet gesynchroniseerd.')
  }
  if (!input.acknowledgeAnomaly && newlyZeroRatio > NEWLY_ZERO_ABORT_RATIO) {
    reasons.push(
      `Stopgezet: ${input.newlyZero} van ${input.matched} SKU's (${pct(newlyZeroRatio)}) vallen nieuw op 0. Drempel is 20%.`
    )
  }
  if (!input.acknowledgeAnomaly && newlyDiscontinuedRatio > NEWLY_DISCONTINUED_ABORT_RATIO) {
    reasons.push(
      `Stopgezet: ${input.newlyDiscontinued} van ${input.matched} SKU's (${pct(newlyDiscontinuedRatio)}) zijn vandaag discontinued. Drempel is 5%.`
    )
  }
  return {
    blocked: reasons.length > 0,
    reasons,
    newlyZeroRatio,
    newlyDiscontinuedRatio,
  }
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`
}

export function buildCounts(
  skus: SkuDecision[],
  products: ProductDecision[],
  errorCount: number
): SyncCounts {
  const matched = skus.filter((s) => s.matched)
  const markedToday = new Set(products.flatMap((p) => p.markHiddenSkus))
  const cleared = new Set(products.flatMap((p) => p.clearHiddenSkus))
  const hiddenTotal = matched.filter((s) => {
    if (cleared.has(s.sku)) return false
    if (markedToday.has(s.sku)) return true
    return Boolean(s.hiddenAt && s.hiddenReason === 'oos_14d')
  }).length
  return {
    synced: matched.length,
    with_stock: matched.filter((s) => s.inStock).length,
    at_zero: matched.filter((s) => s.atZero).length,
    zero_new: matched.filter((s) => s.newlyZero).length,
    oos_1_13: matched.filter((s) => s.oosDays1to13).length,
    hidden_14d_today: markedToday.size,
    hidden_total: hiddenTotal,
    restored: matched.filter((s) => s.returned).length,
    errors: errorCount,
    unmatched: skus.filter((s) => !s.matched && s.sku).length,
    qty_set: matched.filter((s) => s.setQty || s.activate).length,
    policy_deny: matched.filter((s) => s.setPolicyDeny).length,
    track_on: matched.filter((s) => s.setTracked).length,
    activate: matched.filter((s) => s.activate).length,
    unpublish: products.filter((p) => p.unpublish).length,
    republish: products.filter((p) => p.republish).length,
    metafield_set: products.filter((p) => p.metafield === 'set').length,
    metafield_clear: products.filter((p) => p.metafield === 'clear').length,
  }
}

export function detailRows(skus: SkuDecision[], pred: (s: SkuDecision) => boolean): DetailRow[] {
  return skus.filter(pred).slice(0, DETAIL_LIMIT).map((s) => ({
    itemcode: s.sku,
    title: s.title,
    zero_since: s.zeroSince,
    qty: s.targetQty,
    from_qty: s.shopifyQty,
  }))
}

/** Mutaties die deze job nooit mag aanroepen. De test leest de bron. */
export const FORBIDDEN_SHOPIFY_OPERATIONS = [
  'productDelete',
  'productChangeStatus',
  'productSet',
  'productUpdate',
] as const
