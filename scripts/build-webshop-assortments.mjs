#!/usr/bin/env node
/**
 * Stel commercieel B2B-webshopassortiment samen:
 * 1) Selecteer itemcodes per collectie (stock, populair, geen tray-rommel)
 * 2) Markeer als offered in shopify_offered_items
 * 3) Maak Shopify custom collections + producten koppelen
 * 4) Optioneel: --sync-products roept product-sync aan (apart aangeraden)
 *
 *   node --env-file=.env.local scripts/build-webshop-assortments.mjs
 *   node --env-file=.env.local scripts/build-webshop-assortments.mjs --live
 *   node --env-file=.env.local scripts/build-webshop-assortments.mjs --live --limit-per=12
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const LIVE = process.argv.includes('--live')
const limitArg = process.argv.find((a) => a.startsWith('--limit-per='))
const LIMIT_PER = parseInt(limitArg?.split('=')[1] || '14', 10)

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SHOP = process.env.SHOPIFY_STORE_DOMAIN
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04'

if (!SUPA_URL || !SUPA_KEY) {
  console.error('Supabase env ontbreekt')
  process.exit(1)
}
if (LIVE && !SHOP) {
  console.error('SHOPIFY_STORE_DOMAIN ontbreekt')
  process.exit(1)
}

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

/**
 * Commerciële collecties voor SteraPro B2B-webshop.
 * Onderbouwd: low-maintenance kantoor-toppers (Sansevieria, ZZ, Aglaonema,
 * Dracaena, Pothos), statement/reception (Ficus, Strelitzia, Monstera),
 * palmen, hangers, designbladeren — klassiekers in facility/plant hire.
 */
const ASSORTMENTS = [
  {
    key: 'kantoorhelden',
    title: 'Kantoorhelden',
    handle: 'kantoorhelden',
    tag: 'assortiment:kantoorhelden',
    blurb:
      'De onverwoestbare basis voor elk kantoor. Weinig licht, onregelmatig water, toch fris groen. Ideaal voor bureaus, open offices en onderhoudscontracten.',
    bodyHtml: `
<p><strong>Kantoorhelden</strong> zijn de planten die facility managers en medewerkers écht overleven: Sansevieria, ZZ, Aglaonema, Aspidistra en Spathiphyllum.</p>
<ul>
<li>Verdragen matig tot weinig licht</li>
<li>Vergeven een gemiste waterbeurt</li>
<li>Strakke, professionele uitstraling</li>
<li>Perfect voor onderhoudsroutes</li>
</ul>
<p>Samenstelling: robuuste binnenplanten met bewezen trackrecord in commerciële interieurs.</p>
`,
    // SQL fragment: description match, exclude multi-trays where possible
    speciesRegex:
      '^(Sansevieria|Dracaena trifasciata|Zamioculcas|Aspidistra|Aglaonema|Spathiphyllum)',
    preferNoTray: true,
    max: LIMIT_PER,
  },
  {
    key: 'receptie-statement',
    title: 'Receptie & statement',
    handle: 'receptie-statement',
    tag: 'assortiment:receptie-statement',
    blurb:
      'Hoogte en allure bij de inkom, liftlobby of boardroom. Eén sterke plant maakt de ruimte af.',
    bodyHtml: `
<p><strong>Receptie &amp; statement</strong> brengt architecturale planten die ruimte definiëren: Ficus, Strelitzia, Monstera, Beaucarnea en opgaande Dracaena.</p>
<ul>
<li>Visuele impact bij aankomst</li>
<li>Hoogte-varianten voor hoeken en lounges</li>
<li>Herkenbare “wow”-soorten voor B2B-klanten</li>
</ul>
`,
    speciesRegex:
      '^(Ficus lyrata|Ficus elastica|Ficus benghalensis|Ficus microcarpa|Strelitzia|Monstera deliciosa|Beaucarnea|Dracaena marginata|Dracaena fragrans|Dracaena reflexa|Yucca)',
    preferNoTray: true,
    max: LIMIT_PER,
  },
  {
    key: 'palmen-workspace',
    title: 'Palmen voor de workspace',
    handle: 'palmen-workspace',
    tag: 'assortiment:palmen-workspace',
    blurb:
      'Zachte, tropische sfeer zonder vakantiegevoel. Kentia, Areca en Chamaedorea blijven favoriet in Belgische kantoren.',
    bodyHtml: `
<p><strong>Palmen voor de workspace</strong> — Howea (Kentia), Dypsis (Areca), Chamaedorea en Rhapis. Tijdloos, luchtig blad en geschikt voor matig licht.</p>
<ul>
<li>Klassieker in hospitality en kantoren</li>
<li>Goed te combineren met onderhoudscontracten</li>
<li>Meerdere maten: van bureau tot atrium</li>
</ul>
`,
    speciesRegex:
      '^(Howea|Dypsis|Chamaedorea|Rhapis|Livistona|Phoenix|Caryota|Chrysalidocarpus)',
    preferNoTray: true,
    max: Math.min(LIMIT_PER, 12),
  },
  {
    key: 'hang-cascade',
    title: 'Hang & cascade',
    handle: 'hang-cascade',
    tag: 'assortiment:hang-cascade',
    blurb:
      'Hangplanten en klimmers voor planken, kasten en scheidingswanden. Volumemakers met weinig footprint.',
    bodyHtml: `
<p><strong>Hang &amp; cascade</strong>: Epipremnum (Pothos), Scindapsus, Philodendron scandens/hederaceum en Hoya. Snel groener, flexibel in styling.</p>
<ul>
<li>Ideaal boven kasten en op open rekken</li>
<li>Vergeven droge periodes beter dan de meeste hangers</li>
<li>Makkelijk te stekken of te vervangen in contracten</li>
</ul>
`,
    speciesRegex:
      '^(Epipremnum|Scindapsus|Philodendron|Hoya|Hedera|Cissus|Syngonium)',
    preferNoTray: true,
    // Philodendron is breed — filter later to hanging-ish names
    nameFilter: /(scandens|hederaceum|cordatum|micans|brasil|pothos|pictu|epipremnum|scindapsus|hoya|hedera|cascade|hang|trailing)/i,
    max: Math.min(LIMIT_PER, 12),
  },
  {
    key: 'designbladeren',
    title: 'Designbladeren',
    handle: 'designbladeren',
    tag: 'assortiment:designbladeren',
    blurb:
      'Patroon, kleur en vorm voor designkantoren en showrooms. Calathea, Alocasia en opvallende Philodendron-soorten.',
    bodyHtml: `
<p><strong>Designbladeren</strong> voor ruimtes die net dat tikkeltje meer mogen: Calathea/Goeppertia, Alocasia en statement-Philodendron.</p>
<ul>
<li>Hoog “look &amp; feel”-rendement per plant</li>
<li>Perfect in combi met rustige groene basis (Kantoorhelden)</li>
<li>Iets meer licht/zorg — communiceer dat in offertes</li>
</ul>
`,
    speciesRegex:
      '^(Calathea|Goeppertia|Maranta|Ctenanthe|Stromanthe|Alocasia|Anthurium|Monstera)',
    preferNoTray: true,
    max: LIMIT_PER,
  },
]

async function getShopifyToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  const j = await res.json()
  if (!res.ok || !j.access_token) throw new Error(`Shopify token: ${res.status}`)
  return j.access_token
}

async function gql(token, query, variables = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(JSON.stringify(json.errors).slice(0, 400))
  }
  return json.data
}

async function pickItems(assortment) {
  // Stock-first: alle itemcodes met voorraad, dan productdetails filteren
  const stockMap = new Map()
  let from = 0
  const page = 1000
  for (;;) {
    const { data, error } = await sb
      .from('nieuwkoop_stock')
      .select('itemcode, stock_available')
      .gte('stock_available', 3)
      .range(from, from + page - 1)
    if (error) throw error
    const batch = data || []
    for (const r of batch) stockMap.set(r.itemcode, Number(r.stock_available || 0))
    if (batch.length < page) break
    from += page
    if (from > 50_000) break
  }

  const codes = [...stockMap.keys()]
  const re = new RegExp(assortment.speciesRegex, 'i')
  const candidates = []

  // Producten in chunks ophalen
  for (let i = 0; i < codes.length; i += 200) {
    const chunk = codes.slice(i, i + 200)
    const { data, error } = await sb
      .from('nieuwkoop_products')
      .select('itemcode, description, product_group_description_nl')
      .in('itemcode', chunk)
    if (error) throw error
    for (const row of data || []) {
      const desc = row.description || ''
      if (!re.test(desc)) continue
      const grp = (row.product_group_description_nl || '').toLowerCase()
      if (grp.includes('bak') || grp.includes('potten') || grp.includes('pottery')) continue
      if (assortment.preferNoTray && /\d+\s*\/\s*tray/i.test(desc)) continue
      if (assortment.nameFilter && !assortment.nameFilter.test(desc)) continue
      const st = stockMap.get(row.itemcode) || 0
      candidates.push({
        itemcode: row.itemcode,
        description: desc,
        stock: st,
        speciesKey: desc.split(/\s+/).slice(0, 3).join(' ').toLowerCase(),
      })
    }
  }

  candidates.sort((a, b) => b.stock - a.stock)
  const bySpecies = new Map()
  for (const c of candidates) {
    const arr = bySpecies.get(c.speciesKey) || []
    if (arr.length >= 2) continue
    arr.push(c)
    bySpecies.set(c.speciesKey, arr)
  }
  const picked = []
  for (const arr of bySpecies.values()) {
    for (const c of arr) {
      picked.push(c)
      if (picked.length >= assortment.max) break
    }
    if (picked.length >= assortment.max) break
  }
  // Als species-diversiteit te strikt is en we te weinig hebben: vul aan met rest
  if (picked.length < Math.min(6, assortment.max)) {
    for (const c of candidates) {
      if (picked.some((p) => p.itemcode === c.itemcode)) continue
      picked.push(c)
      if (picked.length >= assortment.max) break
    }
  }
  return picked
}

async function markOffered(itemcodes) {
  const rows = itemcodes.map((itemcode) => ({
    itemcode,
    offered: true,
    updated_at: new Date().toISOString(),
  }))
  // upsert in chunks
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    if (!LIVE) {
      console.log(`  [dry-run] would upsert ${chunk.length} offered rows`)
      continue
    }
    const { error } = await sb.from('shopify_offered_items').upsert(chunk, {
      onConflict: 'itemcode',
    })
    if (error) throw error
  }
}

async function ensureCollection(token, assortment, productGids) {
  // Find existing by handle
  const findQ = `
    query ($q: String!) {
      collections(first: 5, query: $q) {
        nodes { id handle title }
      }
    }
  `
  const found = await gql(token, findQ, { q: `handle:${assortment.handle}` })
  let collectionId = found?.collections?.nodes?.[0]?.id

  if (!collectionId) {
    const createM = `
      mutation collectionCreate($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection { id handle title }
          userErrors { field message }
        }
      }
    `
    const input = {
      title: assortment.title,
      handle: assortment.handle,
      descriptionHtml: assortment.bodyHtml.trim(),
      sortOrder: 'BEST_SELLING',
    }
    if (!LIVE) {
      console.log(`  [dry-run] would create collection ${assortment.handle}`)
      return null
    }
    const created = await gql(token, createM, { input })
    const errs = created?.collectionCreate?.userErrors
    if (errs?.length) throw new Error(JSON.stringify(errs))
    collectionId = created.collectionCreate.collection.id
    console.log(`  ✓ collectie aangemaakt: ${assortment.title}`)
  } else {
    // Update copy
    if (LIVE) {
      const upd = `
        mutation collectionUpdate($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection { id }
            userErrors { message }
          }
        }
      `
      await gql(token, upd, {
        input: {
          id: collectionId,
          descriptionHtml: assortment.bodyHtml.trim(),
          title: assortment.title,
        },
      })
    }
    console.log(`  · collectie bestaat: ${assortment.handle}`)
  }

  // Add products
  if (LIVE && productGids.length) {
    const addM = `
      mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          userErrors { message }
        }
      }
    `
    // Shopify max ~250; chunk 50
    for (let i = 0; i < productGids.length; i += 50) {
      const chunk = productGids.slice(i, i + 50)
      const r = await gql(token, addM, { id: collectionId, productIds: chunk })
      const errs = r?.collectionAddProducts?.userErrors
      if (errs?.length) console.warn('  add products:', errs)
    }
    console.log(`  ✓ ${productGids.length} producten aan collectie gekoppeld`)
  }

  // Publish to Online Store if possible
  if (LIVE && collectionId) {
    try {
      const pubs = await gql(
        token,
        `query { publications(first: 10) { nodes { id name } } }`
      )
      const online = (pubs?.publications?.nodes || []).find((p) =>
        /online store/i.test(p.name || '')
      )
      if (online) {
        await gql(
          token,
          `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              userErrors { message }
            }
          }`,
          { id: collectionId, input: [{ publicationId: online.id }] }
        )
      }
    } catch (e) {
      console.warn('  publish collectie:', e.message)
    }
  }

  return collectionId
}

async function findProductGidsByVendor(token, itemcodes) {
  // Products synced as SteraPro vendor; match via SKU on variants
  const gids = new Set()
  for (const code of itemcodes) {
    const q = `
      query ($q: String!) {
        productVariants(first: 5, query: $q) {
          nodes {
            id
            sku
            product { id title vendor }
          }
        }
      }
    `
    try {
      const data = await gql(token, q, { q: `sku:${code}` })
      for (const v of data?.productVariants?.nodes || []) {
        if (v.product?.vendor === 'SteraPro' || true) {
          gids.add(v.product.id)
        }
      }
    } catch {
      /* skip */
    }
  }
  return [...gids]
}

async function main() {
  console.log('='.repeat(60))
  console.log('SteraPro webshop-assortimenten')
  console.log('='.repeat(60))
  console.log('Modus:', LIVE ? '🔴 LIVE' : '🟢 DRY-RUN')
  console.log('Max per collectie:', LIMIT_PER)

  const report = []
  const allCodes = new Set()

  for (const a of ASSORTMENTS) {
    console.log(`\n▶ ${a.title}`)
    const picked = await pickItems(a)
    console.log(`  ${picked.length} SKUs geselecteerd`)
    for (const p of picked.slice(0, 5)) {
      console.log(`    · ${p.itemcode}  ${p.description}  (stock ${p.stock})`)
    }
    if (picked.length > 5) console.log(`    … +${picked.length - 5} meer`)

    for (const p of picked) allCodes.add(p.itemcode)
    report.push({
      key: a.key,
      title: a.title,
      handle: a.handle,
      blurb: a.blurb,
      count: picked.length,
      items: picked,
    })
  }

  console.log(`\n[2] Markeer ${allCodes.size} unieke itemcodes als aangeboden…`)
  await markOffered([...allCodes])
  if (LIVE) console.log('  ✓ shopify_offered_items bijgewerkt')

  // Save report
  const reportPath = join(DIR, 'webshop-assortments-report.json')
  writeFileSync(reportPath, JSON.stringify({ createdAt: new Date().toISOString(), report }, null, 2))
  console.log(`\nRapport: ${reportPath}`)

  if (!LIVE) {
    console.log('\nDry-run klaar. Run met --live om offered + Shopify-collecties te schrijven.')
    console.log('Daarna: node --env-file=.env.local sync-shopify-products.mjs --full --live')
    return
  }

  if (!CLIENT_ID && !process.env.SHOPIFY_ADMIN_TOKEN) {
    console.warn('Geen Shopify credentials — collecties overgeslagen. Offered is wel gezet.')
    return
  }

  console.log('\n[3] Shopify collecties…')
  const token = await getShopifyToken()

  // Products must exist first — try link if already synced
  for (const a of ASSORTMENTS) {
    console.log(`\n▶ Collectie ${a.title}`)
    const codes = report.find((r) => r.key === a.key)?.items.map((i) => i.itemcode) || []
    const gids = await findProductGidsByVendor(token, codes)
    console.log(`  ${gids.length}/${codes.length} producten al in Shopify gevonden`)
    await ensureCollection(token, a, gids)
  }

  console.log('\n✅ Klaar.')
  console.log('Als producten nog ontbreken: sync-shopify-products.mjs --full --live')
  console.log('Daarna dit script opnieuw voor collectie-koppeling, of sync + re-run.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
