/**
 * Staff productdetail voor de catalogus-drawer.
 * GET /api/admin/catalog/[itemcode]
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { classifyCatalogType, tagValues } from '@/lib/catalog-filters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ itemcode: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) return NextResponse.json({ error: 'Geen beheerder' }, { status: 403 })

  const { itemcode: raw } = await ctx.params
  const itemcode = decodeURIComponent(raw || '').trim()
  if (!itemcode) return NextResponse.json({ error: 'Geen itemcode' }, { status: 400 })

  const { data: p, error } = await supabase
    .from('nieuwkoop_products')
    .select(
      'itemcode, description, item_description_nl, sales_price, main_group_code, main_group_description_nl, product_group_code, product_group_description_nl, group_description_nl, item_variety_nl, pot_size, diameter, height, length, width, depth, weight, diameter_culture_pot, height_culture_pot, location_icon_nl, item_picture_name, delivery_time_in_days, is_active_at_source, show_on_website, is_stock_item, item_status, tags, first_seen_at, last_seen_at, discontinued_at'
    )
    .eq('itemcode', itemcode)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!p) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  const [{ data: stock }, { data: offeredRow }, { data: margin }] = await Promise.all([
    supabase
      .from('nieuwkoop_stock')
      .select('stock_available, first_available')
      .eq('itemcode', itemcode)
      .maybeSingle(),
    supabase
      .from('shopify_offered_items')
      .select('offered, updated_at')
      .eq('itemcode', itemcode)
      .maybeSingle(),
    supabase
      .from('v_nieuwkoop_with_margin')
      .select('suggested_sale_price, effective_margin_factor, cost_price')
      .eq('itemcode', itemcode)
      .maybeSingle(),
  ])

  const tags = p.tags
  const locations = tagValues(tags, 'Location')
  const brands = tagValues(tags, 'Brand')
  const collections = tagValues(tags, 'Collection')
  const substrate = tagValues(tags, 'SubstrateType')
  const materials = tagValues(tags, 'Material')
  const shapes = tagValues(tags, 'Shape')
  const light = tagValues(tags, 'LocationLight')
  const temp = tagValues(tags, 'Temperature')

  return NextResponse.json({
    ok: true,
    item: {
      itemcode: p.itemcode,
      description: p.description || p.itemcode,
      detail: p.item_description_nl,
      costPrice: margin?.cost_price ?? p.sales_price,
      salePrice: margin?.suggested_sale_price ?? null,
      marginFactor: margin?.effective_margin_factor ?? null,
      mainGroup: p.main_group_description_nl,
      productGroup: p.product_group_description_nl,
      group: p.group_description_nl,
      variety: p.item_variety_nl,
      potSize: p.pot_size,
      diameter: p.diameter,
      height: p.height,
      length: p.length,
      width: p.width,
      depth: p.depth,
      weight: p.weight,
      diameterCulturePot: p.diameter_culture_pot,
      heightCulturePot: p.height_culture_pot,
      locationIcon: p.location_icon_nl,
      imageItemcode: p.item_picture_name ? p.itemcode : null,
      deliveryDays: p.delivery_time_in_days,
      activeAtSource: p.is_active_at_source !== false,
      showOnWebsite: p.show_on_website,
      isStockItem: p.is_stock_item,
      itemStatus: p.item_status,
      stock: Number(stock?.stock_available ?? 0),
      firstAvailable: stock?.first_available ?? null,
      offered: !!offeredRow?.offered,
      offeredUpdatedAt: offeredRow?.updated_at ?? null,
      catalogType: classifyCatalogType(p),
      locations,
      brands,
      collections,
      substrate,
      materials,
      shapes,
      light,
      temperature: temp,
      firstSeenAt: p.first_seen_at,
      lastSeenAt: p.last_seen_at,
      discontinuedAt: p.discontinued_at,
    },
  })
}
