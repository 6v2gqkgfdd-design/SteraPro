/**
 * Staff catalogus-API met MVP-filters.
 * GET /api/admin/catalog?tab=&type=&location=&stock=&photo=&offered=&price=&height=&brand=&plantsoort=&q=&page=
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { HEIGHT_BANDS, PRICE_BANDS } from '@/lib/catalog-filters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 40

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) return NextResponse.json({ error: 'Geen beheerder' }, { status: 403 })

  const url = new URL(request.url)
  const tab = url.searchParams.get('tab') || 'all'
  const q = (url.searchParams.get('q') || '').trim()
  const type = (url.searchParams.get('type') || '').trim()
  const location = (url.searchParams.get('location') || '').trim()
  const stock = (url.searchParams.get('stock') || '').trim()
  // Foto-filter: accepteer yes/no én UI-labels
  let photo = (url.searchParams.get('photo') || '').trim().toLowerCase()
  if (photo === 'met nk-foto' || photo === 'met_nk_foto' || photo === 'true' || photo === '1') {
    photo = 'yes'
  } else if (
    photo === 'zonder nk-foto' ||
    photo === 'zonder_nk_foto' ||
    photo === 'false' ||
    photo === '0'
  ) {
    photo = 'no'
  } else if (photo !== 'yes' && photo !== 'no') {
    photo = ''
  }
  const offered = (url.searchParams.get('offered') || '').trim()
  const priceBand = (url.searchParams.get('price') || '').trim()
  const heightBand = (url.searchParams.get('height') || '').trim()
  const brand = (url.searchParams.get('brand') || '').trim()
  const plantsoort = (url.searchParams.get('plantsoort') || '').trim()
  const optimized = (url.searchParams.get('optimized') || '').trim()
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)

  // --- Tab Nieuw: open change-events (aparte query) ---
  if (tab === 'new') {
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let cq = supabase
      .from('catalog_changes')
      .select(
        'id, itemcode, change_type, summary, before_data, after_data, created_at, nieuwkoop_products(description, item_picture_name, sales_price, main_group_description_nl, product_group_description_nl, height, diameter, item_variety_nl)',
        { count: 'exact' }
      )
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (q) {
      cq = cq.or(`itemcode.ilike.%${q}%,summary.ilike.%${q}%`)
    }
    if (url.searchParams.get('change_type')) {
      cq = cq.eq('change_type', url.searchParams.get('change_type')!)
    }

    const { data, error, count } = await cq
    if (error) {
      return NextResponse.json({
        ok: true,
        tab,
        page,
        pageSize: PAGE_SIZE,
        total: 0,
        items: [],
        warning: error.message,
      })
    }

    const items = (data ?? []).map((row: Record<string, unknown>) => {
      const p = row.nieuwkoop_products as Record<string, unknown> | null
      return {
        changeId: row.id,
        itemcode: row.itemcode,
        changeType: row.change_type,
        summary: row.summary,
        before: row.before_data,
        after: row.after_data,
        createdAt: row.created_at,
        description: p?.description ?? row.itemcode,
        imageItemcode: p?.item_picture_name ? row.itemcode : null,
        costPrice: p?.sales_price ?? null,
        mainGroup: p?.main_group_description_nl ?? null,
        productGroup: p?.product_group_description_nl ?? null,
        height: p?.height ?? null,
        diameter: p?.diameter ?? null,
        variety: p?.item_variety_nl ?? null,
      }
    })

    const { data: typeRows } = await supabase
      .from('catalog_changes')
      .select('change_type')
      .is('acknowledged_at', null)
      .limit(5000)
    const changeTypeCounts: Record<string, number> = {}
    for (const r of typeRows ?? []) {
      const t = (r as { change_type: string }).change_type
      changeTypeCounts[t] = (changeTypeCounts[t] ?? 0) + 1
    }

    const { count: offeredTotal } = await supabase
      .from('shopify_offered_items')
      .select('*', { count: 'exact', head: true })
      .eq('offered', true)

    return NextResponse.json({
      ok: true,
      tab,
      page,
      pageSize: PAGE_SIZE,
      total: count ?? 0,
      openChanges: count ?? 0,
      offeredTotal: offeredTotal ?? 0,
      changeTypeCounts,
      items,
    })
  }

  // --- Product-tabs via RPC (filters + paginatie) ---
  // Alleen echte prijs/hoogtebanden doorgeven (lege id '' telt niet als band).
  const price = priceBand ? PRICE_BANDS.find((b) => b.id === priceBand) : undefined
  const height = heightBand ? HEIGHT_BANDS.find((b) => b.id === heightBand) : undefined

  const { data, error } = await supabase.rpc('admin_catalog_search', {
    p_tab: tab || 'all',
    p_type: type || null,
    p_location: location || null,
    p_stock: stock || null,
    p_photo: photo || null,
    p_offered: offered || null,
    p_price_min: price?.min ?? null,
    p_price_max: price?.max ?? null,
    p_height_min: height?.min ?? null,
    p_height_max: height?.max ?? null,
    p_brand: brand || null,
    p_plantsoort: plantsoort || null,
    p_q: q || null,
    p_page: page,
    p_page_size: PAGE_SIZE,
    p_optimized: optimized || null,
  })

  if (error) {
    console.error('[admin/catalog] RPC error', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      photo,
      tab,
    })
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        warning:
          error.message.includes('admin_catalog_search') ||
          error.message.includes('function') ||
          error.message.includes('timeout') ||
          error.message.includes('statement')
            ? 'Catalogus-zoekfunctie traag of niet beschikbaar. Probeer “Foto: alles” of ververs over een paar seconden.'
            : error.message,
        tab,
        page,
        pageSize: PAGE_SIZE,
        total: 0,
        items: [],
        debug: { photo, tab, page },
      },
      { status: 500 }
    )
  }

  // Supabase kan jsonb al als object teruggeven, of als string.
  const result =
    typeof data === 'string'
      ? (JSON.parse(data) as Record<string, unknown>)
      : ((data ?? {}) as Record<string, unknown>)

  const items = Array.isArray(result.items) ? result.items : []
  const total = typeof result.total === 'number' ? result.total : Number(result.total) || 0

  return NextResponse.json({
    ok: result.ok !== false,
    tab: result.tab ?? tab,
    page: result.page ?? page,
    pageSize: result.pageSize ?? PAGE_SIZE,
    total,
    openChanges: result.openChanges ?? 0,
    offeredTotal: result.offeredTotal ?? 0,
    typeCounts: result.typeCounts ?? {},
    catalogTypeCounts: result.typeCounts ?? {},
    brands: result.brands ?? [],
    plantsoorten: result.plantsoorten ?? [],
    items,
    error: result.error,
  })
}
