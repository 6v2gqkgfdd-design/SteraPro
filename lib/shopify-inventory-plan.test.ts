import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  FORBIDDEN_SHOPIFY_OPERATIONS,
  SHOP_LOCATION_ID,
  buildCounts,
  decideProducts,
  decideSku,
  evaluateGuards,
  targetQuantity,
  type SavedStockState,
  type ShopifyVariantSnap,
} from './shopify-inventory-plan.ts'
import { insertCatalogChanges, samePrice, specsFingerprint } from './nieuwkoop-catalog-sync.ts'

const TODAY = '2026-10-15'

function variant(over: Partial<ShopifyVariantSnap> = {}): ShopifyVariantSnap {
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
    productStatus: 'ACTIVE',
    ...over,
  }
}

test('discontinued telt als 0, ook als de oude voorraad nog staat', () => {
  assert.equal(targetQuantity(true, 80), 0)
  assert.equal(targetQuantity(false, 150), 100)
  assert.equal(targetQuantity(false, null), 0)
  const sku = decideSku(
    variant({ shopifyQty: 12 }),
    {
      itemcode: 'AA',
      title: 'Uit het gamma',
      discontinued: true,
      discontinuedAt: '2026-09-01T04:00:00Z',
      stockAvailable: 12,
    },
    undefined,
    TODAY
  )
  assert.equal(sku.targetQty, 0)
  assert.equal(sku.newlyZero, true)
  assert.equal(sku.newlyDiscontinued, false)
})

test('14 dagen op 0 verbergt alleen Online Store, en enkel wat de job zelf verborg komt terug', () => {
  const hidden: SavedStockState = {
    lastQty: 0,
    zeroSince: '2026-10-01',
    hiddenAt: null,
    hiddenReason: null,
    lastSyncedAt: null,
  }
  const sku = decideSku(
    variant({ shopifyQty: 0 }),
    {
      itemcode: 'AA',
      title: 'Plant',
      discontinued: false,
      discontinuedAt: null,
      stockAvailable: 0,
    },
    hidden,
    TODAY
  )
  assert.equal(sku.oosElapsedDays, 14)
  assert.equal(sku.oosDays1to13, false)
  const [product] = decideProducts([variant({ shopifyQty: 0 })], [sku])
  assert.equal(product.unpublish, true)
  assert.equal(product.republish, false)
  assert.deepEqual(product.markHiddenSkus, ['AA'])

  const young = decideSku(
    variant({ sku: 'BB', variantId: 'gid://shopify/ProductVariant/2', productId: 'gid://shopify/Product/1' }),
    {
      itemcode: 'BB',
      title: 'Plant',
      discontinued: false,
      discontinuedAt: null,
      stockAvailable: 0,
    },
    { ...hidden, zeroSince: '2026-10-10' },
    TODAY
  )
  assert.equal(young.oosElapsedDays, 5)
  assert.equal(young.oosDays1to13, true)
  const together = decideProducts(
    [
      variant({ shopifyQty: 0 }),
      variant({
        sku: 'BB',
        variantId: 'gid://shopify/ProductVariant/2',
        shopifyQty: 0,
      }),
    ],
    [sku, young]
  )
  assert.equal(together[0].unpublish, false)

  const back = decideSku(
    variant({ shopifyQty: 0 }),
    {
      itemcode: 'AA',
      title: 'Plant',
      discontinued: false,
      discontinuedAt: null,
      stockAvailable: 3,
    },
    { ...hidden, hiddenAt: '2026-10-15T06:00:00Z', hiddenReason: 'oos_14d', lastQty: 0 },
    TODAY
  )
  const restored = decideProducts([variant({ shopifyQty: 0, publishedOnline: false })], [back])
  assert.equal(restored[0].republish, true)
  assert.equal(restored[0].unpublish, false)

  const notOurs = decideSku(
    variant({ shopifyQty: 0, publishedOnline: false }),
    {
      itemcode: 'AA',
      title: 'Plant',
      discontinued: false,
      discontinuedAt: null,
      stockAvailable: 3,
    },
    undefined,
    TODAY
  )
  const leftAlone = decideProducts(
    [variant({ shopifyQty: 0, publishedOnline: false })],
    [notOurs]
  )
  assert.equal(leftAlone[0].republish, false)
  assert.equal(leftAlone[0].unpublish, false)
})

test('drempels: strikt boven 20% nieuw op 0 of 5% discontinued, en een stale bron stopt altijd', () => {
  const exact = evaluateGuards({
    stockFresh: true,
    catalogFresh: true,
    matched: 10,
    newlyZero: 2,
    newlyDiscontinued: 0,
    acknowledgeAnomaly: false,
  })
  assert.equal(exact.blocked, false)

  const over = evaluateGuards({
    stockFresh: true,
    catalogFresh: true,
    matched: 10,
    newlyZero: 3,
    newlyDiscontinued: 1,
    acknowledgeAnomaly: false,
  })
  assert.equal(over.blocked, true)
  assert.equal(over.reasons.length, 2)

  const acked = evaluateGuards({
    stockFresh: true,
    catalogFresh: true,
    matched: 10,
    newlyZero: 3,
    newlyDiscontinued: 1,
    acknowledgeAnomaly: true,
  })
  assert.equal(acked.blocked, false)

  const stale = evaluateGuards({
    stockFresh: false,
    catalogFresh: true,
    matched: 10,
    newlyZero: 0,
    newlyDiscontinued: 0,
    acknowledgeAnomaly: true,
  })
  assert.equal(stale.blocked, true)
})

test('een variant met voorraad houdt het product online', () => {
  const zero = decideSku(
    variant({ shopifyQty: 0 }),
    {
      itemcode: 'AA',
      title: 'Plant',
      discontinued: false,
      discontinuedAt: null,
      stockAvailable: 0,
    },
    {
      lastQty: 0,
      zeroSince: '2026-09-01',
      hiddenAt: null,
      hiddenReason: null,
      lastSyncedAt: null,
    },
    TODAY
  )
  const stocked = decideSku(
    variant({
      sku: 'BB',
      variantId: 'gid://shopify/ProductVariant/2',
      inventoryItemId: 'gid://shopify/InventoryItem/2',
      shopifyQty: 2,
    }),
    {
      itemcode: 'BB',
      title: 'Plant',
      discontinued: false,
      discontinuedAt: null,
      stockAvailable: 2,
    },
    undefined,
    TODAY
  )
  const [product] = decideProducts(
    [variant({ shopifyQty: 0 }), variant({ sku: 'BB', variantId: 'gid://shopify/ProductVariant/2', shopifyQty: 2 })],
    [zero, stocked]
  )
  assert.equal(product.unpublish, false)
  assert.equal(buildCounts([zero, stocked], [product], 0).with_stock, 1)
})

test('voorraad-job noemt de verboden Shopify-mutaties niet', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const files = [
    'lib/shopify-inventory-sync.ts',
    'app/api/cron/sync-shopify-inventory/route.ts',
  ]
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8')
    for (const name of FORBIDDEN_SHOPIFY_OPERATIONS) {
      assert.equal(src.includes(name), false, `${file} bevat ${name}`)
    }
  }
  const sync = fs.readFileSync(path.join(root, 'lib/shopify-inventory-sync.ts'), 'utf8')
  assert.match(sync, /@idempotent\(key:/)
  assert.match(sync, /changeFromQuantity/)
  assert.match(sync, /if \(live && !guard\.blocked\)/)
  assert.equal(sync.includes('ignoreCompareQuantity'), false)
  assert.match(sync, /SHOP_LOCATION_ID/)
  const plan = fs.readFileSync(path.join(root, 'lib/shopify-inventory-plan.ts'), 'utf8')
  assert.ok(plan.includes(SHOP_LOCATION_ID))
  const applyAt = sync.indexOf('await applyWrites')
  const gateAt = sync.indexOf('if (live && !guard.blocked)')
  assert.ok(gateAt !== -1 && applyAt > gateAt)
})

test('handmatige product-sync blijft uit en past bestaande producten niet aan', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const src = fs.readFileSync(path.join(root, 'app/api/shopify/sync/route.ts'), 'utf8')
  assert.match(src, /SHOPIFY_PRODUCT_SYNC_ENABLED !== '1'/)
  assert.match(src, /status: 'DRAFT'/)
  for (const name of ['productChangeStatus', 'productUpdate', 'publishablePublish', 'inventoryPolicy']) {
    assert.equal(src.includes(name), false, name)
  }
  assert.equal(src.includes("status: 'ACTIVE'"), false)
})

test('spec-vergelijking negeert numeric-als-string, de inbox-insert isoleert een foute rij', async () => {
  assert.equal(
    specsFingerprint({ description: 'Ficus', height: '120.00', diameter: '17.0' }),
    specsFingerprint({ description: 'Ficus', height: 120, diameter: 17 })
  )
  assert.equal(samePrice('12.50', 12.5), true)
  assert.equal(samePrice('12.50', 13), false)

  const seen: string[][] = []
  const client = {
    from() {
      return {
        insert(rows: { itemcode: string }[]) {
          seen.push(rows.map((r) => r.itemcode))
          if (rows.length > 1) {
            return Promise.resolve({
              error: { code: '23505', message: 'duplicate key', details: 'itemcode' },
            })
          }
          if (rows[0]?.itemcode === 'BAD') {
            return Promise.resolve({
              error: { code: '23514', message: 'check constraint' },
            })
          }
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  const result = await insertCatalogChanges(client, [
    {
      itemcode: 'BAD',
      change_type: 'spec_changed',
      summary: 'specs',
      before_data: null,
      after_data: null,
    },
    {
      itemcode: 'OK1',
      change_type: 'discontinued',
      summary: 'weg',
      before_data: { is_active_at_source: true },
      after_data: { is_active_at_source: false },
    },
  ])
  assert.equal(result.written, 1)
  assert.equal(result.failures.length, 1)
  assert.equal(seen[0][0], 'OK1')
})
