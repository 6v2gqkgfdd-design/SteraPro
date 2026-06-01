import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Geeft de unieke pot-merken (Brand-tag) terug die in de combinatie-
 * catalogus (groep 275) voorkomen. Gebruikt om op de bedrijfsfiche een
 * huisstijl-merk te kiezen.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const brands = new Set<string>()
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('nieuwkoop_products')
      .select('tags')
      .eq('product_group_code', '275')
      .range(from, from + pageSize - 1)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) break
    for (const r of data as Array<{ tags: unknown }>) {
      if (!Array.isArray(r.tags)) continue
      const t = (
        r.tags as Array<{
          Code?: string
          Values?: Array<{ Description_NL?: string }>
        }>
      ).find((x) => x?.Code === 'Brand')
      const b = t?.Values?.[0]?.Description_NL?.trim()
      if (b) brands.add(b)
    }
    if (data.length < pageSize) break
    from += pageSize
  }

  return NextResponse.json({
    brands: Array.from(brands).sort((a, b) => a.localeCompare(b)),
  })
}
