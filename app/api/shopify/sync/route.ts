/* eslint-disable @typescript-eslint/no-explicit-any */
// Dynamische GraphQL- en Supabase-responsvormen → 'any' is hier bewust.
import { NextResponse } from 'next/server'
import { createClient as createServer } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

// Server-side product-sync (knop op /admin/catalogus).
// Staat uit tenzij SHOPIFY_PRODUCT_SYNC_ENABLED=1.
// Maakt alleen producten die nog niet in Shopify staan, als DRAFT.
// Bestaande producten, hun status, publicatie en voorraadbeleid blijven onaangeroerd.
//
// Vereiste env-vars OP VERCEL (niet enkel .env.local):
//   SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET,
//   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SITE_URL

export const runtime = 'nodejs'
export const maxDuration = 300 // grote selecties kunnen lang duren (plan-afhankelijk geklemd)

const VENDOR = 'SteraPro'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const teeltOf = (v: string | null) => (/hydro/i.test(v ?? '') ? 'Hydrocultuur' : 'Aarde')
const heightLabel = (h: number | null) => (h && h > 0 ? `${Math.round(h)} cm` : 'Standaard')
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function tagVals(tags: any, code: string): string[] {
  if (!Array.isArray(tags)) return []
  const t = tags.find((x: any) => x?.Code === code)
  return (t?.Values ?? []).map((v: any) => (v?.Description_NL ?? '').trim()).filter(Boolean)
}
function specLines(rows: any[]): string[] {
  const r0 = rows[0]
  const heights = [...new Set(rows.map((r) => r.height).filter((h: any) => h && h > 0).map((h: any) => Math.round(h)))].sort((a: number, b: number) => a - b)
  const diam = rows.map((r) => r.diameter).find((x: any) => x && x > 0)
  const loc = r0.location_icon_nl || tagVals(r0.tags, 'Location').join(', ')
  const light = tagVals(r0.tags, 'LocationLight').join(', ')
  const substrate = tagVals(r0.tags, 'SubstrateType')[0]
  const li: string[] = []
  if (heights.length) li.push(`Beschikbare hoogtes: ${heights.length > 1 ? `${heights[0]}–${heights[heights.length - 1]} cm` : `${heights[0]} cm`}`)
  if (diam) li.push(`Pot-Ø: ${Math.round(Number(diam))} cm`)
  if (loc) li.push(`Standplaats: ${loc}`)
  if (light) li.push(`Lichtbehoefte: ${light}`)
  if (substrate) li.push(`Substraat: ${substrate}`)
  return li
}
// Terugval-beschrijving uit structuurgegevens (als er nog geen AI-tekst is).
function buildDesc(rows: any[]): string {
  const r0 = rows[0]
  const d = String(r0.description || '')
  const idx = d.toLowerCase().indexOf(' in ')
  const plant = idx > 0 ? d.slice(0, idx).trim() : d
  const pot = idx > 0 ? d.slice(idx + 4).trim() : ''
  const li = specLines(rows)
  const intro = r0.item_description_nl && r0.item_description_nl.trim() && r0.item_description_nl.trim().toLowerCase() !== d.trim().toLowerCase()
    ? r0.item_description_nl.trim()
    : `${plant}${pot ? ` in een ${pot}` : ''}.`
  const list = li.length ? `<ul>${li.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : ''
  return `<p>${escapeHtml(intro)}</p>${list}`
}
// AI-beschrijving: wervende plant+pot-tekst + verzorgingstips (Anthropic).
async function generateDesc(title: string, specs: string, apiKey: string): Promise<string | null> {
  const system = [
    'Je bent een plantenexpert die wervende, beknopte productbeschrijvingen schrijft',
    'voor een webshop van professionele kamerbeplanting. Schrijf in het Nederlands.',
    'Geef enkel geldige HTML terug (geen markdown, geen code-fences): eerst één korte',
    'wervende alinea (<p>) over de plant én de sierpot, daarna',
    '"<p><strong>Verzorging</strong></p>" gevolgd door een <ul> met 3-4 korte',
    'verzorgingstips (licht, water, standplaats, voeding).',
    'Noem nooit een leverancier of groothandel. Maximaal ~120 woorden.',
  ].join(' ')
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: `Product: ${title}. Kenmerken: ${specs || 'onbekend'}.` }] }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = Array.isArray(data?.content) ? data.content.find((p: any) => p?.type === 'text')?.text : null
    if (!text) return null
    return String(text).replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim() || null
  } catch { return null }
}

export async function POST() {
  // 1) Auth: enkel beheerders.
  const supa = await createServer()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Niet ingelogd.' }, { status: 401 })
  const { data: staff } = await supa.rpc('is_staff')
  if (!staff) return NextResponse.json({ ok: false, error: 'Geen beheerder.' }, { status: 403 })
  if (process.env.SHOPIFY_PRODUCT_SYNC_ENABLED !== '1') {
    return NextResponse.json(
      { ok: false, error: 'Shopify-productsync staat uit.' },
      { status: 403 }
    )
  }

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const SHOP = process.env.SHOPIFY_STORE_DOMAIN
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET
  const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04'
  const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'Shopify-config ontbreekt op de server (SHOPIFY_STORE_DOMAIN / CLIENT_ID / CLIENT_SECRET in Vercel).' },
      { status: 500 }
    )
  }

  const admin = createAdmin(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })
  const imageUrlFor = (code: string) =>
    SITE_URL ? `${SITE_URL}/api/nieuwkoop/image/${encodeURIComponent(code)}`
             : `${SUPA_URL}/storage/v1/object/public/nieuwkoop-images/${encodeURIComponent(code)}.jpg`

  // 2) Data ophalen.
  async function fetchAll(table: string, select: string, build: (q: any) => any) {
    const PAGE = 1000
    let out: any[] = []
    let from = 0
    for (;;) {
      let q: any = admin.from(table).select(select).range(from, from + PAGE - 1)
      q = build(q)
      const { data, error } = await q
      if (error) throw new Error(`${table}: ${error.message}`)
      out = out.concat(data ?? [])
      if (!data || data.length < PAGE) break
      from += PAGE
    }
    return out
  }

  // 3) Shopify-token + GraphQL.
  let TOKEN = ''
  async function gql(query: string, variables: any, attempt = 1): Promise<any> {
    const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 429 && attempt <= 5) { await sleep(2000 * attempt); return gql(query, variables, attempt + 1) }
    const j = await res.json()
    if (j.errors) throw new Error(JSON.stringify(j.errors))
    return j.data
  }

  try {
    // Token via client_credentials.
    const tokRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
    })
    const tok = await tokRes.json().catch(() => ({}))
    if (!tokRes.ok || !tok.access_token) {
      return NextResponse.json({ ok: false, error: `Shopify-token mislukt (app geïnstalleerd? scopes?).` }, { status: 502 })
    }
    TOKEN = tok.access_token
    const grantedScopes = String(tok.scope || '')

    // Data — selectie uitsluitend via shopify_offered_items (Supabase = waarheid).
    const [priceRows, prodRows, offeredItems] = await Promise.all([
      fetchAll('v_nieuwkoop_with_margin', 'itemcode, suggested_sale_price',
        (q) => q.not('suggested_sale_price', 'is', null)),
      fetchAll('nieuwkoop_products',
        'itemcode, description, item_description_nl, item_variety_nl, height, diameter, location_icon_nl, tags, delivery_time_in_days, product_group_description_nl, item_picture_name, show_on_website',
        (q) => q),
      fetchAll('shopify_offered_items', 'itemcode, offered', (q) => q.eq('offered', true)),
    ])
    const priceByCode = new Map<string, number>(priceRows.map((r: any) => [r.itemcode, Number(r.suggested_sale_price)]))
    const offeredItemSet = new Set<string>(offeredItems.map((r: any) => r.itemcode))

    // Alleen aangeboden itemcodes; groepeer op description voor Shopify-varianten.
    const byName = new Map<string, any[]>()
    for (const r of prodRows as any[]) {
      if (!priceByCode.has(r.itemcode)) continue
      if (!offeredItemSet.has(r.itemcode)) continue
      const name = (r.description ?? r.itemcode).trim()
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name)!.push(r)
    }

    const products = [...byName.entries()].map(([name, rows]) => {
      const multiTeelt = new Set(rows.map((r) => teeltOf(r.item_variety_nl))).size > 1
      const byKey = new Map<string, any>()
      for (const r of rows) {
        const teelt = multiTeelt ? teeltOf(r.item_variety_nl) : null
        const label = heightLabel(r.height)
        const key = teelt ? `${label}||${teelt}` : label
        const price = priceByCode.get(r.itemcode)!
        const cur = byKey.get(key)
        if (!cur || price < cur.price) byKey.set(key, { label, teelt, price, itemcode: r.itemcode, hasImage: !!r.item_picture_name })
      }
      const chosen = [...byKey.values()]
      const heights = [...new Set(chosen.map((x) => x.label))]
      const teelten = [...new Set(chosen.map((x) => x.teelt).filter(Boolean))]
      const options: any[] = [{ name: 'Hoogte', values: heights.map((h) => ({ name: h })) }]
      if (multiTeelt) options.push({ name: 'Teelt', values: teelten.map((t) => ({ name: t })) })
      const variants = chosen.map((x) => ({
        price: x.price.toFixed(2),
        optionValues: multiTeelt
          ? [{ optionName: 'Hoogte', name: x.label }, { optionName: 'Teelt', name: x.teelt }]
          : [{ optionName: 'Hoogte', name: x.label }],
        inventoryItem: { sku: x.itemcode, tracked: true },
      }))
      const imgItem = chosen.find((x) => x.hasImage) || rows.find((r) => r.item_picture_name)
      return {
        handle: slug(name), title: name, vendor: VENDOR,
        productType: rows[0].product_group_description_nl || '',
        descriptionHtml: buildDesc(rows),
        specs: specLines(rows).join('; '),
        leadDays: Math.max(0, ...rows.map((r: any) => Number(r.delivery_time_in_days) || 0)),
        productOptions: options, variants,
        image: imgItem ? imageUrlFor(imgItem.itemcode) : null,
      }
    })

    // Categorie is optioneel en raakt status of publicatie niet.
    let CATEGORY_ID: string | null = null
    try {
      const d = await gql(`query($q:String!){ taxonomy { categories(first:8, search:$q){ nodes { id fullName } } } }`, { q: 'Houseplant' })
      const nodes = d?.taxonomy?.categories?.nodes || []
      CATEGORY_ID = (nodes.find((n: any) => /plant/i.test(n.fullName)) || nodes[0])?.id || null
    } catch {}

    // Pushen.
    const PRODUCT_SET = `mutation P($input: ProductSetInput!){ productSet(synchronous:true, input:$input){ product { id } userErrors { message } } }`

    // AI-beschrijvingen: gecached, en per run beperkt om time-outs te vermijden.
    const apiKey = process.env.ANTHROPIC_API_KEY
    const AI_CAP = 15
    let aiGenerated = 0
    const { data: descRows } = await admin.from('shopify_product_descriptions').select('group_name, body_html')
    const cacheByName = new Map<string, string>((descRows ?? []).map((r: any) => [r.group_name, r.body_html]))

    let created = 0, skippedExisting = 0, failed = 0
    const errors: string[] = []
    for (const p of products) {
      try {
        const found = await gql(`query($q:String!){ products(first:1, query:$q){ nodes { id } } }`, { q: `handle:${p.handle}` })
        if (found?.products?.nodes?.[0]?.id) {
          skippedExisting++
          continue
        }
        let skuExists = false
        for (const v of p.variants) {
          const sku = v.inventoryItem?.sku
          if (!sku) continue
          const hit = await gql(
            `query($q:String!){ productVariants(first:1, query:$q){ nodes { id } } }`,
            { q: `sku:${JSON.stringify(sku)}` }
          )
          if (hit?.productVariants?.nodes?.[0]?.id) {
            skuExists = true
            break
          }
        }
        if (skuExists) {
          skippedExisting++
          continue
        }
        let body: string | undefined = cacheByName.get(p.title)
        if (!body && apiKey && aiGenerated < AI_CAP) {
          body = (await generateDesc(p.title, p.specs, apiKey)) || undefined
          if (body) {
            aiGenerated++
            try {
              await admin.from('shopify_product_descriptions').upsert({ group_name: p.title, body_html: body, generated_at: new Date().toISOString() })
            } catch {}
          }
        }
        const lead = p.leadDays > 0
          ? `<p><em>Op bestelling — levertijd ± ${p.leadDays} werkdagen.</em></p>`
          : '<p><em>Op bestelling.</em></p>'
        const input: any = {
          title: p.title, handle: p.handle, vendor: p.vendor, productType: p.productType,
          descriptionHtml: (body || p.descriptionHtml) + lead,
          status: 'DRAFT', productOptions: p.productOptions, variants: p.variants,
        }
        if (CATEGORY_ID) input.category = CATEGORY_ID
        if (p.image) input.files = [{ originalSource: p.image, contentType: 'IMAGE' }]
        let d = await gql(PRODUCT_SET, { input })
        let errs = d?.productSet?.userErrors || []
        // Faalt het? Probeer opnieuw zonder categorie én zonder foto. Op een
        // Shopify-trial kunnen geen afbeeldingen worden geüpload; zo blijft het
        // product tóch pushen (foto's volgen automatisch zodra er een plan is).
        if (errs.length && (input.category || input.files)) {
          const { category, files, ...rest } = input
          void category; void files
          d = await gql(PRODUCT_SET, { input: rest })
          errs = d?.productSet?.userErrors || []
        }
        if (errs.length) { failed++; errors.push(`${p.title}: ${errs.map((e: any) => e.message).join('; ')}`); continue }
        created++
      } catch (e: any) { failed++; errors.push(`${p.title}: ${e?.message || 'fout'}`) }
      await sleep(120)
    }

    return NextResponse.json({
      ok: true,
      created,
      skippedExisting,
      failed,
      aiGenerated,
      selected: products.length,
      errors: errors.slice(0, 3),
      scopes: grantedScopes,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Onbekende fout' }, { status: 500 })
  }
}
