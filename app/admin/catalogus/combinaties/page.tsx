/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Legacy combi-selectie (plant+pot groepen) — behouden als /admin/catalogus/combinaties.
 * De hoofd-catalogus is nu de full Nieuwkoop-catalogus.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCatalogItems } from '@/lib/catalog-items'
import CatalogSelectionClient, { type ProductGroup } from '../CatalogSelectionClient'

export const dynamic = 'force-dynamic'

const teeltOf = (v: string | null) => (/hydro/i.test(v ?? '') ? 'Hydrocultuur' : 'Aarde')
const heightLabel = (h: number | null) => (h && h > 0 ? `${Math.round(h)} cm` : 'Standaard')
function locClass(locs: string[]): string | null {
  const b = locs.includes('Binnen')
  const o = locs.includes('Buiten')
  if (b && o) return 'Binnen & buiten'
  if (b) return 'Binnen'
  if (o) return 'Buiten'
  return null
}

export default async function CombinatiesSelectiePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) {
    return (
      <main className="bg-stera-cream p-6">
        <div className="mx-auto max-w-md">
          <div className="stera-card text-sm">
            <p className="font-semibold text-stera-ink">Geen toegang</p>
          </div>
        </div>
      </main>
    )
  }

  const groups: ProductGroup[] = []

  try {
    const items = (await loadCatalogItems(supabase)).filter((i) => !i.isMos)
    const { data: offeredRows } = await supabase
      .from('shopify_offered_products')
      .select('group_name, offered')
      .eq('offered', true)
    const offeredSet = new Set((offeredRows ?? []).map((r: any) => r.group_name))

    const byName = new Map<string, typeof items>()
    for (const it of items) {
      const name = it.description.trim()
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name)!.push(it)
    }

    for (const [name, rows] of byName) {
      const multiTeelt = new Set(rows.map((r) => teeltOf(r.itemVariety))).size > 1
      const byKey = new Map<string, any>()
      for (const r of rows) {
        const teelt = multiTeelt ? teeltOf(r.itemVariety) : null
        const label = heightLabel(r.height)
        const key = teelt ? `${label}||${teelt}` : label
        const cur = byKey.get(key)
        if (!cur || r.salePrice < cur.price) {
          byKey.set(key, { label, teelt, price: r.salePrice, itemcode: r.itemcode })
        }
      }
      const variants = [...byKey.values()].sort((a: any, b: any) => a.price - b.price)
      const prices = variants.map((v: any) => v.price)
      const imgItem = rows.find((r) => r.hasImage) || rows[0]
      groups.push({
        name,
        imageItemcode: imgItem?.itemcode ?? null,
        variants,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        offered: offeredSet.has(name),
        potMerk: rows[0]?.brand || rows[0]?.merk || null,
        collection: rows[0]?.collection || null,
        plantsoort: rows[0]?.plantsoort || null,
        shape: rows[0]?.shape || null,
        location: locClass(rows[0]?.locations ?? []),
      })
    }
    groups.sort((a, b) => a.name.localeCompare(b.name))
  } catch (e) {
    console.error(e)
  }

  return <CatalogSelectionClient groups={groups} />
}
