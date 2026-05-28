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
//
// Optionele filters voor het slimme offertevoorstel:
//   light         → location_icon_nl (zon / half-schaduw / schaduw)
//   potMin/potMax → diameter_culture_pot (cm) — potmaat-bereik
//   heightMin/Max → height (cm)
const ALLOWED_GROUPS = new Set(['100', '275', '300'])

function numParam(url: URL, key: string): number | null {
  const raw = url.searchParams.get(key)
  if (raw == null || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

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
  const light = (url.searchParams.get('light') || '').trim()
  const potMin = numParam(url, 'potMin')
  const potMax = numParam(url, 'potMax')
  const heightMin = numParam(url, 'heightMin')
  const heightMax = numParam(url, 'heightMax')

  let query = supabase
    .from('v_nieuwkoop_with_margin')
    .select(
      'itemcode, description, item_picture_name, cost_price, suggested_sale_price, product_group_code, height, diameter, diameter_culture_pot, pot_size, location_icon_nl'
    )
    .eq('product_group_code', group)
    .order('description')
    .limit(60)

  // Voor planten (groep 100) is de "potmaat" de cultuurpot waarin de
  // plant staat; voor buitenpotten (groep 300) en All-in-1 combinaties
  // (groep 275) de eigen diameter van de pot.
  const potColumn =
    group === '300' || group === '275'
      ? 'diameter'
      : 'diameter_culture_pot'

  if (q) query = query.ilike('description', `%${q}%`)
  if (light) query = query.eq('location_icon_nl', light)
  if (potMin != null) query = query.gte(potColumn, potMin)
  if (potMax != null) query = query.lte(potColumn, potMax)
  if (heightMin != null) query = query.gte('height', heightMin)
  if (heightMax != null) query = query.lte('height', heightMax)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}
