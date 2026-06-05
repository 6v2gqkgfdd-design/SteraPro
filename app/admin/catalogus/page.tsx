/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCatalogItems } from '@/lib/catalog-items'
import CatalogSelectionClient, { type ProductGroup } from './CatalogSelectionClient'

export const dynamic = 'force-dynamic'

// Zelfde teelt/maat-groepering als de Shopify-sync.
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

export default async function CatalogusSelectiePage() {
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
            <p className="mt-1 text-stera-ink-soft">
              Je bent ingelogd als <code>{user.email}</code>, maar dit is geen
              beheerder-account.
            </p>
          </div>
        </div>
      </main>
    )
  }

  const groups: ProductGroup[] = []
  let loadError: string | null = null

  try {
    // Zelfde bron + afgeleide kenmerken als de klant-webshop (combinaties,
    // moswanden eruit), zodat de filters hier 1-op-1 met /catalog overeenkomen.
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
      const variants = [...byKey.values()].sort((a, b) => a.price - b.price)
      const prices = variants.map((v) => v.price)
      const imgItem = rows.find((r) => r.hasImage) || rows[0]
      groups.push({
        name,
        imageItemcode: imgItem.itemcode,
        variants,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        offered: offeredSet.has(name),
        potMerk: rows[0].brand || rows[0].merk || null,
        collection: rows[0].collection || null,
        plantsoort: rows[0].plantsoort || null,
        shape: rows[0].shape || null,
        location: locClass(rows[0].locations),
      })
    }
    groups.sort((a, b) => a.name.localeCompare(b.name))
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Onbekende fout'
  }

  if (loadError) {
    return (
      <main className="bg-stera-cream p-6">
        <div className="mx-auto max-w-3xl">
          <div className="stera-card border-red-200 bg-red-50 text-sm text-red-700">
            <p className="font-semibold">Kon de catalogus niet laden</p>
            <p className="mt-1 font-mono text-xs break-words">{loadError}</p>
          </div>
        </div>
      </main>
    )
  }

  return <CatalogSelectionClient groups={groups} />
}
