import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// Zoekt in de gesynchroniseerde Nieuwkoop-catalogus (Supabase view
// v_nieuwkoop_with_margin — bevat de inkoopprijs én de verkoopprijs
// na marge).
//
// Productgroepen (kolom product_group_code):
//   100 = Hydrocultuur  → de planten die Stera voor kantoren aanbiedt
//   300 = Plantenbakken → de buitenpotten
const ALLOWED_GROUPS = new Set(['100', '300'])

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const url = new URL(req.url)
  const groupParam = url.searchParams.get('group') || '100'
  const group = ALLOWED_GROUPS.has(groupParam) ? groupParam : '100'
  const q = (url.searchParams.get('q') || '').trim()

  let query = supabase
    .from('v_nieuwkoop_with_margin')
    .select(
      'itemcode, description, item_picture_name, cost_price, suggested_sale_price, product_group_code, height, diameter_culture_pot, pot_size, location_icon_nl'
    )
    .eq('product_group_code', group)
    .order('description')
    .limit(48)

  if (q) {
    query = query.ilike('description', `%${q}%`)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}
