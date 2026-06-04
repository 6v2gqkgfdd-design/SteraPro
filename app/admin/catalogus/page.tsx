import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CatalogSelectionClient, { type ProductGroup } from './CatalogSelectionClient'

export const dynamic = 'force-dynamic'

// Zelfde groeperings-logica als de Shopify-sync, zodat wat je hier selecteert
// exact overeenkomt met wat gepusht wordt.
const MOS_WORDS = ['bolmos', 'platmos', 'rendiermos', 'bol- en', 'mosschilderij', 'moss painting']
function isMoss(desc: string | null, variety: string | null) {
  const s = `${desc ?? ''} ${variety ?? ''}`.toLowerCase()
  return MOS_WORDS.some((w) => s.includes(w))
}
function teeltOf(variety: string | null) {
  return /hydro/i.test(variety ?? '') ? 'Hydrocultuur' : 'Aarde'
}
function heightLabel(h: number | null) {
  return h && h > 0 ? `${Math.round(h)} cm` : 'Standaard'
}

type ProdRow = {
  itemcode: string
  description: string | null
  item_variety_nl: string | null
  height: number | null
  product_group_description_nl: string | null
  item_picture_name: string | null
}

export default async function CatalogusSelectiePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) redirect('/dashboard')

  // 1) Prijzen (view) + structuur (nieuwkoop_products), gepagineerd ophalen.
  async function fetchAll<T>(
    table: string,
    select: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter: (q: any) => any
  ): Promise<T[]> {
    const PAGE = 1000
    let out: T[] = []
    let from = 0
    for (;;) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase.from(table).select(select).range(from, from + PAGE - 1)
      q = filter(q)
      const { data, error } = await q
      if (error) throw new Error(`${table}: ${error.message}`)
      out = out.concat((data ?? []) as T[])
      if (!data || data.length < PAGE) break
      from += PAGE
    }
    return out
  }

  const groups: ProductGroup[] = []
  let loadError: string | null = null

  try {
    const [priceRows, prodRows, offeredRows] = await Promise.all([
      fetchAll<{ itemcode: string; suggested_sale_price: number | null }>(
        'v_nieuwkoop_with_margin',
        'itemcode, suggested_sale_price',
        (q) => q.not('suggested_sale_price', 'is', null).eq('show_on_website', true)
      ),
      fetchAll<ProdRow>(
        'nieuwkoop_products',
        'itemcode, description, item_variety_nl, height, product_group_description_nl, item_picture_name',
        (q) => q.eq('show_on_website', true)
      ),
      fetchAll<{ group_name: string; offered: boolean }>(
        'shopify_offered_products',
        'group_name, offered',
        (q) => q
      ),
    ])

    const priceByCode = new Map(priceRows.map((r) => [r.itemcode, Number(r.suggested_sale_price)]))
    const offeredSet = new Set(offeredRows.filter((r) => r.offered).map((r) => r.group_name))

    // Groeperen op naam.
    const byName = new Map<string, ProdRow[]>()
    for (const r of prodRows) {
      if (!priceByCode.has(r.itemcode)) continue
      if (isMoss(r.description, r.item_variety_nl)) continue
      const name = (r.description ?? r.itemcode).trim()
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name)!.push(r)
    }

    for (const [name, rows] of byName) {
      const multiTeelt = new Set(rows.map((r) => teeltOf(r.item_variety_nl))).size > 1
      // Dedup op variant-sleutel, goedkoopste wint.
      const byKey = new Map<string, { label: string; teelt: string | null; price: number; itemcode: string }>()
      for (const r of rows) {
        const teelt = multiTeelt ? teeltOf(r.item_variety_nl) : null
        const label = heightLabel(r.height)
        const key = teelt ? `${label}||${teelt}` : label
        const price = priceByCode.get(r.itemcode)!
        const cur = byKey.get(key)
        if (!cur || price < cur.price) byKey.set(key, { label, teelt, price, itemcode: r.itemcode })
      }
      const variants = [...byKey.values()].sort((a, b) => a.price - b.price)
      const prices = variants.map((v) => v.price)
      const imgItem = rows.find((r) => r.item_picture_name)
      groups.push({
        name,
        category: rows[0].product_group_description_nl ?? '—',
        imageItemcode: imgItem?.itemcode ?? null,
        variants,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        offered: offeredSet.has(name),
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
            <p className="mt-3 text-stera-ink-soft">
              Staat de tabel <code>shopify_offered_products</code> al in Supabase?
              Voer anders eerst de migratie uit.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return <CatalogSelectionClient groups={groups} />
}
