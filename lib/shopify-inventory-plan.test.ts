import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  FORBIDDEN_SHOPIFY_OPERATIONS,
  OOS_STATUS_TEXT,
  SHOP_LOCATION_ID,
  buildCounts,
  isArtificialCatalog,
  decideProducts,
  decideSku,
  evaluateGuards,
  groupVariantsBySku,
  planInventorySync,
  targetQuantity,
  type CatalogStock,
  type SavedStockState,
  type ShopifyVariantSnap,
} from './shopify-inventory-plan.ts'
import { insertCatalogChanges, samePrice, specsFingerprint } from './nieuwkoop-catalog-sync.ts'
import { inferCatalogType } from './location.ts'

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
    voorraadstatus: null,
    productStatus: 'ACTIVE',
    tags: [],
    ...over,
  }
}

function catalog(over: Partial<CatalogStock> = {}): CatalogStock {
  return {
    itemcode: 'AA',
    title: 'Plant',
    discontinued: false,
    discontinuedAt: null,
    stockAvailable: 4,
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

test('ARCHIVED en uitsluit-tags worden niet gepland', () => {
  const rows = [
    catalog({ itemcode: 'CC1', stockAvailable: 3 }),
    catalog({ itemcode: 'PLANT1', title: 'Ficus', stockAvailable: 0, mainGroupDescription: 'Planten' }),
  ]
  const byCode = new Map(rows.map((row) => [row.itemcode, row]))
  const planned = planInventorySync({
    today: TODAY,
    catalog: byCode,
    state: new Map(),
    variants: [
      variant({
        sku: 'CC1',
        productStatus: 'ARCHIVED',
        shopifyQty: 9,
        inventoryPolicy: 'CONTINUE',
        tracked: false,
      }),
      variant({
        sku: 'PLANT1',
        variantId: 'gid://shopify/ProductVariant/2',
        productId: 'gid://shopify/Product/2',
        tags: ['showroom', 'Geen-Voorraadsync'],
        shopifyQty: 2,
        inventoryPolicy: 'CONTINUE',
      }),
      variant({
        sku: 'CC1',
        variantId: 'gid://shopify/ProductVariant/3',
        productId: 'gid://shopify/Product/3',
        tags: ['legacy-per-maat'],
        productStatus: 'ACTIVE',
        shopifyQty: 1,
      }),
      variant({
        sku: 'SERIE1',
        variantId: 'gid://shopify/ProductVariant/4',
        productId: 'gid://shopify/Product/4',
        tags: ['Legacy-Serie'],
        productStatus: 'ACTIVE',
        shopifyQty: 6,
        inventoryPolicy: 'CONTINUE',
        tracked: false,
      }),
    ],
  })
  assert.equal(planned.excluded.length, 4)
  assert.deepEqual(
    planned.excluded.map((row) => row.reason).sort(),
    ['archived', 'tag', 'tag', 'tag']
  )
  assert.equal(planned.excluded.find((row) => row.sku === 'SERIE1')?.reason, 'tag')
  assert.equal(planned.skus.length, 0)
  assert.equal(planned.products.length, 0)
  assert.equal(planned.counts.qty_set, 0)
  assert.equal(planned.counts.policy_deny, 0)
  assert.equal(planned.counts.track_on, 0)
  assert.equal(planned.counts.metafield_set, 0)
  assert.equal(planned.counts.archive, 0)
  assert.equal(planned.counts.unpublish, 0)
  assert.equal(planned.counts.excluded, 4)
})

test('elke variant met dezelfde SKU krijgt qty, DENY en de nulvoorraad-tekst', () => {
  const item = catalog({
    itemcode: 'CC0060777',
    stockAvailable: 0,
    groupDescription: 'Combinaties',
    productGroupDescription: 'All-in-1',
  })
  const planned = planInventorySync({
    today: TODAY,
    catalog: new Map([[item.itemcode, item]]),
    state: new Map(),
    variants: [
      variant({
        sku: 'CC0060777',
        shopifyQty: 4,
        inventoryPolicy: 'CONTINUE',
        variantId: 'gid://shopify/ProductVariant/10',
        inventoryItemId: 'gid://shopify/InventoryItem/10',
      }),
      variant({
        sku: 'CC0060777',
        shopifyQty: 4,
        inventoryPolicy: 'CONTINUE',
        variantId: 'gid://shopify/ProductVariant/11',
        inventoryItemId: 'gid://shopify/InventoryItem/11',
        productId: 'gid://shopify/Product/1',
      }),
    ],
  })
  const grouped = groupVariantsBySku(planned.included)
  assert.equal(grouped.get('CC0060777')?.length, 2)
  assert.equal(planned.counts.duplicate_sku_variants, 2)
  assert.equal(planned.skus.length, 2)
  for (const sku of planned.skus) {
    assert.equal(sku.setQty, true)
    assert.equal(sku.targetQty, 0)
    assert.equal(sku.setPolicyDeny, true)
    assert.equal(sku.setOosMessage, true)
    assert.equal(sku.oosMessage, OOS_STATUS_TEXT)
  }
  assert.equal(new Set(planned.skus.map((s) => s.variantId)).size, 2)
  assert.equal(new Set(planned.skus.map((s) => s.inventoryItemId)).size, 2)
})

test('niet-CC volgt de CC-regels, artificial niet, archief alleen bij ongepubliceerde DRAFT', () => {
  const samples = [
    { groupDescription: 'Combinaties', productGroupDescription: 'All-in-1', mainGroupDescription: 'Planten' },
    { productGroupDescription: 'Artificial plants', groupDescription: 'Artificial' },
    { mainGroupDescription: 'Planten', productGroupDescription: 'Hydrocultuur' },
    { productGroupDescription: 'Plantenbakken' },
    { productGroupDescription: 'Moswanden' },
    { productGroupDescription: 'Hulpmiddelen' },
  ]
  for (const sample of samples) {
    const artificial =
      inferCatalogType({
        group_description_nl: sample.groupDescription,
        product_group_description_nl: sample.productGroupDescription,
        main_group_description_nl: sample.mainGroupDescription,
      }) === 'artificial'
    assert.equal(isArtificialCatalog(catalog(sample)), artificial)
  }

  const hidden = {
    lastQty: 0,
    zeroSince: '2026-10-01',
    hiddenAt: null,
    hiddenReason: null,
    lastSyncedAt: null,
  } satisfies SavedStockState
  const plant = catalog({
    itemcode: '6BS100',
    title: 'Ficus',
    stockAvailable: 0,
    mainGroupDescription: 'Planten',
    productGroupDescription: 'Hydrocultuur',
  })
  const pot = catalog({
    itemcode: 'POT300',
    title: 'Buitenpot',
    stockAvailable: 0,
    productGroupDescription: 'Plantenbakken',
  })
  const cc = catalog({
    itemcode: 'CC0060777',
    title: 'Combi',
    stockAvailable: 0,
    groupDescription: 'Combinaties',
  })
  const artificial = catalog({
    itemcode: 'ART1',
    title: 'Kunstficus',
    stockAvailable: 0,
    productGroupDescription: 'Artificial plants',
    groupDescription: 'Artificial',
  })
  const planned = planInventorySync({
    today: TODAY,
    publicationKnown: true,
    catalog: new Map([plant, pot, cc, artificial].map((row) => [row.itemcode, row])),
    state: new Map([
      [plant.itemcode, hidden],
      [pot.itemcode, hidden],
      [cc.itemcode, hidden],
      [artificial.itemcode, hidden],
    ]),
    variants: [
      variant({
        sku: plant.itemcode,
        productId: 'gid://shopify/Product/p',
        variantId: 'gid://shopify/ProductVariant/p',
        productStatus: 'DRAFT',
        publishedOnline: false,
        shopifyQty: 0,
        inventoryPolicy: 'CONTINUE',
      }),
      variant({
        sku: pot.itemcode,
        productId: 'gid://shopify/Product/o',
        variantId: 'gid://shopify/ProductVariant/o',
        productStatus: 'DRAFT',
        publishedOnline: false,
        shopifyQty: 0,
        inventoryPolicy: 'CONTINUE',
      }),
      variant({
        sku: cc.itemcode,
        productId: 'gid://shopify/Product/c',
        variantId: 'gid://shopify/ProductVariant/c',
        productStatus: 'ACTIVE',
        publishedOnline: true,
        shopifyQty: 0,
        inventoryPolicy: 'CONTINUE',
      }),
      variant({
        sku: artificial.itemcode,
        productId: 'gid://shopify/Product/a',
        variantId: 'gid://shopify/ProductVariant/a',
        productStatus: 'DRAFT',
        publishedOnline: false,
        shopifyQty: 2,
        inventoryPolicy: 'CONTINUE',
        tracked: false,
      }),
    ],
  })
  const bySku = new Map(planned.skus.map((s) => [s.sku, s]))
  for (const code of [plant.itemcode, pot.itemcode, cc.itemcode]) {
    const sku = bySku.get(code)
    assert.ok(sku)
    assert.equal(sku.zeroStockRules, true)
    assert.equal(sku.setPolicyDeny, true)
    assert.equal(sku.oosMessage, OOS_STATUS_TEXT)
    assert.equal(sku.setOosMessage, true)
  }
  const art = bySku.get(artificial.itemcode)
  assert.ok(art)
  assert.equal(art.zeroStockRules, false)
  assert.equal(art.setPolicyDeny, false)
  assert.equal(art.oosMessage, null)
  assert.equal(art.setOosMessage, false)
  assert.equal(art.setQty, true)
  assert.equal(art.setTracked, true)

  const byProduct = new Map(planned.products.map((p) => [p.productId, p]))
  assert.equal(byProduct.get('gid://shopify/Product/p')?.archive, true)
  assert.equal(byProduct.get('gid://shopify/Product/p')?.unpublish, false)
  assert.equal(byProduct.get('gid://shopify/Product/o')?.archive, true)
  assert.equal(byProduct.get('gid://shopify/Product/c')?.archive, false)
  assert.equal(byProduct.get('gid://shopify/Product/c')?.unpublish, true)
  assert.equal(byProduct.get('gid://shopify/Product/a')?.archive, false)
  assert.equal(byProduct.get('gid://shopify/Product/a')?.unpublish, false)
  assert.equal(byProduct.get('gid://shopify/Product/a')?.metafield, 'keep')

  const direct = decideSku(
    variant({ productStatus: 'ARCHIVED', tags: ['legacy-per-maat'], inventoryPolicy: 'CONTINUE' }),
    catalog({ stockAvailable: 1 }),
    undefined,
    TODAY
  )
  assert.equal(direct.excluded, true)
  assert.equal(direct.setQty, false)
  assert.equal(direct.setPolicyDeny, false)
  assert.equal(direct.setTracked, false)
  assert.equal(direct.setOosMessage, false)
  const [product] = decideProducts([variant({ productStatus: 'ARCHIVED' })], [direct])
  assert.equal(product, undefined)
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
  assert.match(sync, /tags/)
  assert.match(sync, /status/)
  assert.match(sync, /planInventorySync/)
  assert.match(sync, /productChangeStatus/)
  assert.match(sync, /status: 'ARCHIVED'/)
  assert.equal(sync.includes("status: 'ACTIVE'"), false)
  assert.match(sync, /product\.archive/)
  assert.match(sync, /!== 'DRAFT'/)
  const plan = fs.readFileSync(path.join(root, 'lib/shopify-inventory-plan.ts'), 'utf8')
  assert.ok(plan.includes(SHOP_LOCATION_ID))
  assert.match(plan, /legacy-per-maat/)
  assert.match(plan, /legacy-serie/)
  assert.match(plan, /geen-voorraadsync/)
  assert.match(plan, /voorlopig niet op voorraad/)
  assert.match(sync, /legacy-serie/)
  const stockScript = fs.readFileSync(path.join(root, 'sync-shopify-stock.mjs'), 'utf8')
  assert.match(stockScript, /legacy-per-maat/)
  assert.match(stockScript, /legacy-serie/)
  assert.match(stockScript, /geen-voorraadsync/)
  assert.match(stockScript, /ARCHIVED/)
  assert.match(stockScript, /product \{ status tags \}/)
  assert.match(stockScript, /variantsBySku/)
  assert.equal(stockScript.includes('invByCode.set'), false)
  const liveExit = stockScript.indexOf('if (!isLive)')
  const mutation = stockScript.indexOf('inventorySetQuantities')
  assert.ok(liveExit !== -1 && mutation > liveExit)
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
