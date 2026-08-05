/**
 * Gedeelde Nieuwkoop → Supabase catalogus-sync.
 * Gebruikt door de ochtend-cron en herbruikbaar vanuit scripts.
 *
 * - Full of delta items-pull (GEEN combi-filter)
 * - Voorraad-upsert
 * - Change-inbox: new / price_changed / spec_changed / discontinued / back_in_stock
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ChangeType =
  | 'new'
  | 'back_in_stock'
  | 'price_changed'
  | 'spec_changed'
  | 'discontinued'

export type CatalogSyncResult = {
  ok: true
  mode: 'full' | 'delta'
  since: string
  fetched: number
  upserted: number
  stockUpserted: number
  changes: Record<ChangeType, number>
  discontinued: number
  errors: string[]
}

type NkItem = Record<string, unknown> & {
  Itemcode?: string
  Description?: string
  ItemDescription_NL?: string
  ItemStatus?: string
  Salesprice?: number
  MainGroupCode?: string
  MainGroupDescription_NL?: string
  ProductGroupCode?: string
  ProductGroupDescription_NL?: string
  GroupDescription?: string
  GroupDescription_NL?: string
  ItemVariety_NL?: string
  PotSize?: string
  SalesPackage_NL?: string
  SalesOrderSize?: number
  Diameter?: number
  Width?: number
  Height?: number
  Depth?: number
  Length?: number
  Opening?: number
  Weight?: number
  DiameterCulturePot?: number
  HeightCulturePot?: number
  LocationIcon_NL?: string
  LocationUsagePlanters_NL?: string
  ItemPictureName?: string
  ItemPictureSysmodified?: string
  IsStockItem?: boolean
  Warehouse?: string
  ShowOnWebsite?: boolean
  IsOffer?: boolean
  DeliveryTimeInDays?: number
  QuantityPallet?: number
  QuantityTrolley?: number
  CountryOfOrigin?: string
  CountryOfProvenance?: string
  CitesListed?: boolean
  FytoListed?: boolean
  PlantPassportCode?: string
  GTINCode?: string
  HSCode?: string | number
  HSCodeUK?: string
  Tags?: unknown
  Sysmodified?: string
}

type ExistingRow = {
  itemcode: string
  sales_price: number | null
  description: string | null
  height: number | null
  diameter: number | null
  item_variety_nl: string | null
  pot_size: string | null
  item_picture_name: string | null
  product_group_code: string | null
  main_group_code: string | null
  is_active_at_source: boolean | null
}

type StockRow = {
  Itemcode?: string
  StockAvailable?: number
  FirstAvailable?: string | null
  Sysmodified?: string | null
}

const FETCH_TIMEOUT_MS = 180_000
const BATCH = 500

function toTimestamp(s?: string | null): string | null {
  if (!s) return null
  return s.includes('Z') ? s : `${s}Z`
}

function authHeader(user: string, pass: string) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

async function fetchJson<T>(url: string, auth: string, attempt = 1): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Authorization: auth, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    return (await res.json()) as T
  } catch (e) {
    const reason =
      e instanceof Error && e.name === 'AbortError'
        ? `time-out na ${FETCH_TIMEOUT_MS / 1000}s`
        : e instanceof Error
          ? e.message
          : 'netwerkfout'
    if (attempt < 2) return fetchJson(url, auth, attempt + 1)
    throw new Error(reason)
  } finally {
    clearTimeout(timer)
  }
}

function mapItem(it: NkItem, now: string) {
  return {
    itemcode: String(it.Itemcode),
    description: it.Description ?? null,
    item_description_nl: it.ItemDescription_NL ?? null,
    item_status: it.ItemStatus ?? null,
    sales_price: it.Salesprice ?? null,
    main_group_code: it.MainGroupCode ?? null,
    main_group_description_nl: it.MainGroupDescription_NL ?? null,
    product_group_code: it.ProductGroupCode ?? null,
    product_group_description_nl: it.ProductGroupDescription_NL ?? null,
    group_description: it.GroupDescription ?? null,
    group_description_nl: it.GroupDescription_NL ?? null,
    item_variety_nl: it.ItemVariety_NL ?? null,
    pot_size: it.PotSize ?? null,
    sales_package_nl: it.SalesPackage_NL?.toString().trim() || null,
    sales_order_size: it.SalesOrderSize ?? null,
    diameter: it.Diameter ?? null,
    width: it.Width ?? null,
    height: it.Height ?? null,
    depth: it.Depth ?? null,
    length: it.Length ?? null,
    opening: it.Opening ?? null,
    weight: it.Weight ?? null,
    diameter_culture_pot: it.DiameterCulturePot ?? null,
    height_culture_pot: it.HeightCulturePot ?? null,
    location_icon_nl: it.LocationIcon_NL ?? null,
    location_usage_planters_nl: it.LocationUsagePlanters_NL ?? null,
    item_picture_name: it.ItemPictureName ?? null,
    item_picture_sysmodified: toTimestamp(it.ItemPictureSysmodified),
    is_stock_item: it.IsStockItem ?? null,
    warehouse: it.Warehouse ?? null,
    show_on_website: it.ShowOnWebsite ?? null,
    is_offer: it.IsOffer ?? null,
    delivery_time_in_days: it.DeliveryTimeInDays ?? null,
    quantity_pallet: it.QuantityPallet ?? null,
    quantity_trolley: it.QuantityTrolley ?? null,
    country_of_origin: it.CountryOfOrigin ?? null,
    country_of_provenance: it.CountryOfProvenance ?? null,
    cites_listed: it.CitesListed ?? null,
    fyto_listed: it.FytoListed ?? null,
    plant_passport_code: it.PlantPassportCode ?? null,
    gtin_code: it.GTINCode ?? null,
    hs_code: it.HSCode != null ? String(it.HSCode) : null,
    hs_code_uk: it.HSCodeUK ?? null,
    tags: it.Tags || [],
    raw_data: it,
    sysmodified: toTimestamp(it.Sysmodified),
    synced_at: now,
    last_seen_at: now,
    is_active_at_source: true,
    discontinued_at: null,
  }
}

function specsFingerprint(r: {
  description?: string | null
  height?: number | null
  diameter?: number | null
  item_variety_nl?: string | null
  pot_size?: string | null
  item_picture_name?: string | null
  product_group_code?: string | null
  main_group_code?: string | null
}) {
  return [
    r.description ?? '',
    r.height ?? '',
    r.diameter ?? '',
    r.item_variety_nl ?? '',
    r.pot_size ?? '',
    r.item_picture_name ?? '',
    r.product_group_code ?? '',
    r.main_group_code ?? '',
  ].join('|')
}

async function fetchAllCodes(
  supabase: SupabaseClient,
  select: string
): Promise<ExistingRow[]> {
  const out: ExistingRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('nieuwkoop_products')
      .select(select)
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    out.push(...(data as unknown as ExistingRow[]))
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

async function upsertBatches(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<number> {
  let n = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table).upsert(batch, { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
    n += batch.length
  }
  return n
}

export type SyncEnv = {
  NK_BASE: string
  NK_USER: string
  NK_PASS: string
}

export async function runCatalogMorningSync(
  supabase: SupabaseClient,
  env: SyncEnv,
  opts: { mode?: 'full' | 'delta'; lookbackDays?: number } = {}
): Promise<CatalogSyncResult> {
  const mode = opts.mode ?? 'full'
  const lookbackDays = opts.lookbackDays ?? 3
  const since =
    mode === 'full'
      ? '2000-01-01'
      : new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10)

  const auth = authHeader(env.NK_USER, env.NK_PASS)
  const now = new Date().toISOString()
  const errors: string[] = []
  const changes: Record<ChangeType, number> = {
    new: 0,
    back_in_stock: 0,
    price_changed: 0,
    spec_changed: 0,
    discontinued: 0,
  }

  // --- 1) Items ophalen ---
  const items = await fetchJson<NkItem[]>(
    `${env.NK_BASE.replace(/\/$/, '')}/items?sysmodified=${since}`,
    auth
  )
  const valid = items.filter((it) => it?.Itemcode)

  // --- 2) Bestaande rijen laden (voor change-detectie) ---
  const existing = await fetchAllCodes(
    supabase,
    'itemcode, sales_price, description, height, diameter, item_variety_nl, pot_size, item_picture_name, product_group_code, main_group_code, is_active_at_source'
  )
  const byCode = new Map(existing.map((r) => [r.itemcode, r]))

  // --- 3) Wijzigingen + rows ---
  const productRows: Record<string, unknown>[] = []
  const changeRows: {
    itemcode: string
    change_type: ChangeType
    summary: string
    before_data: Record<string, unknown> | null
    after_data: Record<string, unknown> | null
  }[] = []

  for (const it of valid) {
    const code = String(it.Itemcode)
    const row = mapItem(it, now)
    productRows.push(row)

    const prev = byCode.get(code)
    if (!prev) {
      changeRows.push({
        itemcode: code,
        change_type: 'new',
        summary: `Nieuw artikel: ${row.description || code}`,
        before_data: null,
        after_data: {
          sales_price: row.sales_price,
          description: row.description,
          height: row.height,
          diameter: row.diameter,
        },
      })
      changes.new++
      continue
    }

    // Was discontinued, nu terug in de feed → behandel als nieuw signaal
    if (prev.is_active_at_source === false) {
      changeRows.push({
        itemcode: code,
        change_type: 'new',
        summary: `Opnieuw in catalogus: ${row.description || code}`,
        before_data: { is_active_at_source: false },
        after_data: { is_active_at_source: true },
      })
      changes.new++
    }

    const oldPrice = prev.sales_price == null ? null : Number(prev.sales_price)
    const newPrice = row.sales_price == null ? null : Number(row.sales_price)
    if (oldPrice !== newPrice) {
      changeRows.push({
        itemcode: code,
        change_type: 'price_changed',
        summary: `Prijs ${oldPrice ?? '—'} → ${newPrice ?? '—'}`,
        before_data: { sales_price: oldPrice },
        after_data: { sales_price: newPrice },
      })
      changes.price_changed++
    }

    const prevFp = specsFingerprint(prev)
    const nextFp = specsFingerprint({
      description: row.description as string | null,
      height: row.height as number | null,
      diameter: row.diameter as number | null,
      item_variety_nl: row.item_variety_nl as string | null,
      pot_size: row.pot_size as string | null,
      item_picture_name: row.item_picture_name as string | null,
      product_group_code: row.product_group_code as string | null,
      main_group_code: row.main_group_code as string | null,
    })
    if (prevFp !== nextFp) {
      changeRows.push({
        itemcode: code,
        change_type: 'spec_changed',
        summary: `Specs gewijzigd: ${row.description || code}`,
        before_data: {
          description: prev.description,
          height: prev.height,
          diameter: prev.diameter,
          item_variety_nl: prev.item_variety_nl,
          pot_size: prev.pot_size,
        },
        after_data: {
          description: row.description,
          height: row.height,
          diameter: row.diameter,
          item_variety_nl: row.item_variety_nl,
          pot_size: row.pot_size,
        },
      })
      changes.spec_changed++
    }
  }

  // --- 4) Products upsert ---
  const upserted = await upsertBatches(
    supabase,
    'nieuwkoop_products',
    productRows,
    'itemcode'
  )

  // --- 5) Full-mode: items die niet meer in de feed zitten ---
  let discontinued = 0
  if (mode === 'full') {
    const seen = new Set(valid.map((it) => String(it.Itemcode)))
    const missing = existing.filter(
      (r) => r.is_active_at_source !== false && !seen.has(r.itemcode)
    )
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH)
      const codes = batch.map((r) => r.itemcode)
      const { error } = await supabase
        .from('nieuwkoop_products')
        .update({
          is_active_at_source: false,
          discontinued_at: now,
          synced_at: now,
        })
        .in('itemcode', codes)
      if (error) {
        errors.push(`discontinued update: ${error.message}`)
        break
      }
      for (const r of batch) {
        changeRows.push({
          itemcode: r.itemcode,
          change_type: 'discontinued',
          summary: `Niet meer in Nieuwkoop-feed: ${r.description || r.itemcode}`,
          before_data: { is_active_at_source: true },
          after_data: { is_active_at_source: false },
        })
        changes.discontinued++
        discontinued++
      }
    }
  }

  // --- 6) Stock delta + back_in_stock ---
  const stockSince =
    mode === 'full'
      ? '2000-01-01'
      : new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10)

  let stockUpserted = 0
  try {
    const stock = await fetchJson<StockRow[]>(
      `${env.NK_BASE.replace(/\/$/, '')}/stock?sysmodified=${stockSince}`,
      auth
    )

    // Bekende itemcodes (na upsert = full set in DB; bij delta: alles wat we kennen)
    const known = new Set<string>()
    {
      let from = 0
      for (;;) {
        const { data, error } = await supabase
          .from('nieuwkoop_products')
          .select('itemcode')
          .range(from, from + 999)
        if (error) throw new Error(error.message)
        if (!data?.length) break
        for (const r of data) known.add(r.itemcode as string)
        if (data.length < 1000) break
        from += 1000
      }
    }

    // Vorige stock voor back_in_stock
    const prevStock = new Map<string, number>()
    {
      let from = 0
      for (;;) {
        const { data, error } = await supabase
          .from('nieuwkoop_stock')
          .select('itemcode, stock_available')
          .range(from, from + 999)
        if (error) throw new Error(error.message)
        if (!data?.length) break
        for (const r of data) {
          prevStock.set(r.itemcode as string, Number(r.stock_available ?? 0))
        }
        if (data.length < 1000) break
        from += 1000
      }
    }

    const stockRows = stock
      .filter((s) => s?.Itemcode && known.has(s.Itemcode))
      .map((s) => {
        const code = s.Itemcode as string
        const qty =
          typeof s.StockAvailable === 'number' && Number.isFinite(s.StockAvailable)
            ? s.StockAvailable
            : 0
        const oldQty = prevStock.get(code)
        if (oldQty !== undefined && oldQty <= 0 && qty > 0) {
          changeRows.push({
            itemcode: code,
            change_type: 'back_in_stock',
            summary: `Weer op voorraad: ${qty}`,
            before_data: { stock_available: oldQty },
            after_data: { stock_available: qty },
          })
          changes.back_in_stock++
        }
        return {
          itemcode: code,
          stock_available: qty,
          first_available: s.FirstAvailable ?? null,
          sysmodified: toTimestamp(s.Sysmodified),
          synced_at: now,
        }
      })

    stockUpserted = await upsertBatches(
      supabase,
      'nieuwkoop_stock',
      stockRows,
      'itemcode'
    )
  } catch (e) {
    errors.push(`stock: ${e instanceof Error ? e.message : 'onbekend'}`)
  }

  // --- 7) Change rows schrijven ---
  // Dedup: zelfde itemcode+type op dezelfde run mag 1x.
  const seenChange = new Set<string>()
  const uniqueChanges = changeRows.filter((c) => {
    const k = `${c.itemcode}|${c.change_type}|${c.summary}`
    if (seenChange.has(k)) return false
    seenChange.add(k)
    return true
  })

  for (let i = 0; i < uniqueChanges.length; i += BATCH) {
    const batch = uniqueChanges.slice(i, i + BATCH)
    const { error } = await supabase.from('catalog_changes').insert(batch)
    if (error) {
      // Tabel bestaat mogelijk nog niet (migratie niet toegepast)
      errors.push(`catalog_changes insert: ${error.message}`)
      break
    }
  }

  return {
    ok: true,
    mode,
    since,
    fetched: valid.length,
    upserted,
    stockUpserted,
    changes,
    discontinued,
    errors,
  }
}
