/**
 * Staff catalogus-API: full Nieuwkoop-catalogus, filters, tabs, paginatie.
 * GET /api/admin/catalog?tab=all|new|offered|oos|discontinued&q=&main_group=&page=1
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const mainGroup = (url.searchParams.get('main_group') || '').trim()
  const productGroup = (url.searchParams.get('product_group') || '').trim()
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // --- Tab Nieuw: open change-events ---
  if (tab === 'new') {
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
      // Filter via itemcode of summary
      cq = cq.or(`itemcode.ilike.%${q}%,summary.ilike.%${q}%`)
    }

    const { data, error, count } = await cq
    if (error) {
      // Tabel ontbreekt nog
      return NextResponse.json({
        ok: true,
        tab,
        page,
        pageSize: PAGE_SIZE,
        total: 0,
        items: [],
        warning: error.message.includes('catalog_changes')
          ? 'Migratie catalog_changes nog niet toegepast.'
          : error.message,
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

    // Counts per type (open)
    const { data: typeRows } = await supabase
      .from('catalog_changes')
      .select('change_type')
      .is('acknowledged_at', null)
    const typeCounts: Record<string, number> = {}
    for (const r of typeRows ?? []) {
      const t = (r as { change_type: string }).change_type
      typeCounts[t] = (typeCounts[t] ?? 0) + 1
    }

    return NextResponse.json({
      ok: true,
      tab,
      page,
      pageSize: PAGE_SIZE,
      total: count ?? 0,
      typeCounts,
      items,
    })
  }

  // --- Overige tabs: producten ---
  // Tab "offered": start vanuit shopify_offered_items (correcte paginatie).
  let productCodesFilter: string[] | null = null
  if (tab === 'offered') {
    const { data: offRows, error: offErr, count: offCount } = await supabase
      .from('shopify_offered_items')
      .select('itemcode', { count: 'exact' })
      .eq('offered', true)
      .range(from, to)
    if (offErr) {
      return NextResponse.json({
        ok: true,
        tab,
        page,
        pageSize: PAGE_SIZE,
        total: 0,
        items: [],
        warning: offErr.message,
      })
    }
    productCodesFilter = (offRows ?? []).map((r) => r.itemcode as string)
    if (productCodesFilter.length === 0) {
      return NextResponse.json({
        ok: true,
        tab,
        page,
        pageSize: PAGE_SIZE,
        total: offCount ?? 0,
        openChanges: 0,
        offeredTotal: offCount ?? 0,
        mainGroups: [],
        items: [],
      })
    }
  }

  let pq = supabase
    .from('nieuwkoop_products')
    .select(
      'itemcode, description, item_description_nl, sales_price, main_group_code, main_group_description_nl, product_group_code, product_group_description_nl, group_description_nl, item_variety_nl, pot_size, diameter, height, length, width, item_picture_name, delivery_time_in_days, is_active_at_source, first_seen_at, last_seen_at, discontinued_at, show_on_website',
      { count: 'exact' }
    )
    .order('description', { ascending: true })

  if (productCodesFilter) {
    pq = pq.in('itemcode', productCodesFilter)
  } else {
    pq = pq.range(from, to)
  }

  if (tab === 'discontinued') {
    pq = pq.eq('is_active_at_source', false)
  } else if (tab === 'all' || tab === 'oos') {
    pq = pq.or('is_active_at_source.eq.true,is_active_at_source.is.null')
  }

  if (q) {
    pq = pq.or(
      `description.ilike.%${q}%,itemcode.ilike.%${q}%,item_description_nl.ilike.%${q}%,item_variety_nl.ilike.%${q}%`
    )
  }
  if (mainGroup) pq = pq.eq('main_group_description_nl', mainGroup)
  if (productGroup) pq = pq.eq('product_group_description_nl', productGroup)

  const { data: products, error: pErr, count } = await pq
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 })
  }

  const codes = (products ?? []).map((p) => p.itemcode as string)

  // Stock + offered
  const stockBy = new Map<string, number>()
  const offeredBy = new Map<string, boolean>()
  if (codes.length) {
    const [{ data: stocks }, { data: offered }] = await Promise.all([
      supabase.from('nieuwkoop_stock').select('itemcode, stock_available').in('itemcode', codes),
      supabase.from('shopify_offered_items').select('itemcode, offered').in('itemcode', codes),
    ])
    for (const s of stocks ?? []) {
      stockBy.set(s.itemcode as string, Number(s.stock_available ?? 0))
    }
    for (const o of offered ?? []) {
      offeredBy.set(o.itemcode as string, !!o.offered)
    }
  }

  let items = (products ?? []).map((p) => {
    const stock = stockBy.get(p.itemcode as string) ?? 0
    const offered =
      tab === 'offered' ? true : (offeredBy.get(p.itemcode as string) ?? false)
    return {
      itemcode: p.itemcode,
      description: p.description || p.itemcode,
      detail: p.item_description_nl,
      costPrice: p.sales_price,
      mainGroup: p.main_group_description_nl,
      productGroup: p.product_group_description_nl,
      group: p.group_description_nl,
      variety: p.item_variety_nl,
      potSize: p.pot_size,
      diameter: p.diameter,
      height: p.height,
      length: p.length,
      width: p.width,
      imageItemcode: p.item_picture_name ? p.itemcode : null,
      deliveryDays: p.delivery_time_in_days,
      activeAtSource: p.is_active_at_source !== false,
      stock,
      offered,
      showOnWebsite: p.show_on_website,
    }
  })

  // OOS: filter binnen de pagina (benadering); stock zit in aparte tabel.
  // Voor een exacte OOS-lijst is een view/join nodig — dit filtert de huidige page-set.
  if (tab === 'oos') {
    items = items.filter((i) => i.stock <= 0)
  }

  // Facet: main groups (top-level counts — lightweight sample)
  const { data: groupRows } = await supabase
    .from('nieuwkoop_products')
    .select('main_group_description_nl')
    .not('main_group_description_nl', 'is', null)
    .limit(5000)
  const mainGroups = new Map<string, number>()
  for (const r of groupRows ?? []) {
    const g = (r.main_group_description_nl as string) || '—'
    mainGroups.set(g, (mainGroups.get(g) ?? 0) + 1)
  }

  // Open changes count
  let openChanges = 0
  {
    const { count: c } = await supabase
      .from('catalog_changes')
      .select('*', { count: 'exact', head: true })
      .is('acknowledged_at', null)
    openChanges = c ?? 0
  }

  // Offered total
  let offeredTotal = 0
  {
    const { count: c } = await supabase
      .from('shopify_offered_items')
      .select('*', { count: 'exact', head: true })
      .eq('offered', true)
    offeredTotal = c ?? 0
  }

  return NextResponse.json({
    ok: true,
    tab,
    page,
    pageSize: PAGE_SIZE,
    total: count ?? 0,
    openChanges,
    offeredTotal,
    mainGroups: [...mainGroups.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([name, n]) => ({ name, count: n })),
    items,
  })
}
