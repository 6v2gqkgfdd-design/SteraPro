#!/usr/bin/env node
/**
 * Sync Supabase-catalogus -> SteraPro Shopify-shop (gegroepeerd op product).
 *
 * Eén Shopify-product per plant-pot-naam (description), met:
 *   - HOOGTE als variant ("120 cm", "140 cm", ...)
 *   - TEELT als variant ("Aarde" / "Hydrocultuur") wanneer beide bestaan
 * Verkoopprijs = suggested_sale_price uit v_nieuwkoop_with_margin (excl. btw,
 * marge al toegepast). White-label: vendor "Stera", geen leveranciersnaam.
 * Mosschilderijen worden (voorlopig) uitgefilterd.
 *
 * Idempotent: handle = slug(naam); bestaand product wordt bijgewerkt (op id).
 *
 * Gebruik:
 *   node --env-file=.env.local sync-shopify-products.mjs                 # DRY-RUN
 *   node --env-file=.env.local sync-shopify-products.mjs --limit=10 --live
 *   node --env-file=.env.local sync-shopify-products.mjs --full --live
 *   node --env-file=.env.local sync-shopify-products.mjs --wipe --live   # ⚠️ verwijdert ALLE producten, dan sync
 *
 * Vereisten in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (bestaan al)
 *   NEXT_PUBLIC_SITE_URL=https://sterapro.vercel.app      (voor foto's via app-route)
 *   SHOPIFY_STORE_DOMAIN=0ancs7-zs.myshopify.com
 *   SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET             (Dev Dashboard app, client_credentials)
 *   SHOPIFY_API_VERSION=2026-04                           (optioneel)
 */

import { createClient } from "@supabase/supabase-js";

// ============================================================
// Config + args
// ============================================================
const args = process.argv.slice(2);
const isLive = args.includes("--live");
const isFull = args.includes("--full");
const doWipe = args.includes("--wipe");
const limitArg = args.find((a) => a.startsWith("--limit="));
// limit = aantal PRODUCTEN (na groepering)
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : isFull ? Infinity : 25;

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
let TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const VENDOR = "SteraPro";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const BUCKET_BASE = `${SUPA_URL}/storage/v1/object/public/nieuwkoop-images`;
function imageUrlFor(itemcode) {
  return SITE_URL
    ? `${SITE_URL}/api/nieuwkoop/image/${encodeURIComponent(itemcode)}`
    : `${BUCKET_BASE}/${encodeURIComponent(itemcode)}.jpg`;
}

const missing = [];
if (!SUPA_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!SUPA_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (isLive && !SHOP) missing.push("SHOPIFY_STORE_DOMAIN");
if (isLive && !TOKEN && !(CLIENT_ID && CLIENT_SECRET)) missing.push("SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET");
if (missing.length) {
  console.error("❌ Ontbrekende env vars in .env.local:", missing.join(", "));
  process.exit(1);
}

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("=".repeat(60));
console.log("Supabase-catalogus -> SteraPro Shopify (gegroepeerd)");
console.log("=".repeat(60));
console.log("Modus:        ", isLive ? "🔴 LIVE" : "🟢 DRY-RUN (schrijft niets)");
console.log("Aantal:       ", limit === Infinity ? "ALLE producten" : `eerste ${limit} producten`);
if (doWipe) console.log("Wipe:         ", "⚠️  ALLE bestaande producten worden eerst verwijderd");
if (isLive) console.log("Shop:         ", SHOP, `(API ${API_VERSION})`);
console.log("=".repeat(60));

// ============================================================
// 1) Data ophalen: prijs (view) + structuur (nieuwkoop_products)
// ============================================================
console.log("\n[1] Catalogus + prijzen ophalen uit Supabase...");

async function fetchAll(table, select, applyFilters) {
  const PAGE = 1000;
  let out = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    q = applyFilters(q);
    const { data, error } = await q;
    if (error) { console.error(`❌ ${table}:`, error.message); process.exit(1); }
    out = out.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const [priceRows, prodRows] = await Promise.all([
  fetchAll("v_nieuwkoop_with_margin", "itemcode, suggested_sale_price", (q) =>
    q.not("suggested_sale_price", "is", null).eq("show_on_website", true)
  ),
  fetchAll(
    "nieuwkoop_products",
    "itemcode, description, item_variety_nl, height, diameter, width, length, product_group_description_nl, item_picture_name, show_on_website",
    (q) => q.eq("show_on_website", true)
  ),
]);

const priceByCode = new Map(priceRows.map((r) => [r.itemcode, Number(r.suggested_sale_price)]));
console.log(`    ✅ ${prodRows.length} items, ${priceByCode.size} met verkoopprijs`);

// ============================================================
// 2) Filteren (mosschilderijen eruit) + verrijken
// ============================================================
const MOS_WORDS = ["bolmos", "platmos", "rendiermos", "bol- en", "mosschilderij", "moss painting"];
function isMoss(it) {
  const s = `${it.description || ""} ${it.item_variety_nl || ""}`.toLowerCase();
  return MOS_WORDS.some((w) => s.includes(w));
}
function teeltOf(variety) {
  return /hydro/i.test(variety || "") ? "Hydrocultuur" : "Aarde";
}
function heightLabel(h) {
  return h && h > 0 ? `${Math.round(h)} cm` : "Standaard";
}

const items = prodRows
  .filter((it) => priceByCode.has(it.itemcode) && !isMoss(it))
  .map((it) => ({
    itemcode: it.itemcode,
    name: (it.description || it.itemcode).trim(),
    price: priceByCode.get(it.itemcode),
    teelt: teeltOf(it.item_variety_nl),
    hLabel: heightLabel(it.height),
    productType: it.product_group_description_nl || "",
    hasImage: !!it.item_picture_name,
  }));
const mossCount = prodRows.filter((it) => priceByCode.has(it.itemcode) && isMoss(it)).length;
console.log(`    Na filter: ${items.length} plant-items (${mossCount} mos-items overgeslagen)`);

// ============================================================
// 3) Groeperen op naam -> producten met varianten
// ============================================================
function slug(s) {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const groups = new Map();
for (const it of items) {
  if (!groups.has(it.name)) groups.set(it.name, []);
  groups.get(it.name).push(it);
}

let dupMerged = 0;
function buildProduct(name, g) {
  const multiTeelt = new Set(g.map((x) => x.teelt)).size > 1;
  // Dedup op variant-sleutel; goedkoopste wint.
  const byKey = new Map();
  for (const x of g) {
    const key = multiTeelt ? `${x.hLabel}||${x.teelt}` : x.hLabel;
    const cur = byKey.get(key);
    if (!cur || x.price < cur.price) { if (cur) dupMerged++; byKey.set(key, x); }
    else dupMerged++;
  }
  const chosen = [...byKey.values()];

  const heights = [...new Set(chosen.map((x) => x.hLabel))];
  const teelten = [...new Set(chosen.map((x) => x.teelt))];
  const options = [{ name: "Hoogte", values: heights.map((h) => ({ name: h })) }];
  if (multiTeelt) options.push({ name: "Teelt", values: teelten.map((t) => ({ name: t })) });

  const variants = chosen.map((x) => {
    const optionValues = [{ optionName: "Hoogte", name: x.hLabel }];
    if (multiTeelt) optionValues.push({ optionName: "Teelt", name: x.teelt });
    return {
      price: x.price.toFixed(2),
      optionValues,
      // Voorraad bijhouden, maar bestellen blijft mogelijk ook bij 0 (Stera
      // bestelt op aanvraag bij de leverancier). De juiste aantallen zet de
      // aparte voorraad-sync.
      inventoryPolicy: "CONTINUE",
      inventoryItem: { sku: x.itemcode, tracked: true },
    };
  });

  const imgItem = chosen.find((x) => x.hasImage) || g.find((x) => x.hasImage);
  return {
    handle: slug(name),
    title: name,
    vendor: VENDOR,
    productType: g[0].productType,
    status: "ACTIVE",
    productOptions: options,
    variants,
    _image: imgItem ? imageUrlFor(imgItem.itemcode) : null,
  };
}

let products = [...groups.entries()].map(([name, g]) => buildProduct(name, g));
products.sort((a, b) => a.title.localeCompare(b.title));
console.log(`    ✅ ${products.length} producten (gem. ${(items.length / products.length).toFixed(2)} maten/product, ${dupMerged} dubbels samengevoegd)`);

// Selectie toepassen: enkel combinaties die in /admin/catalogus aanstaan.
const { data: offeredRows, error: offErr } = await supabase
  .from("shopify_offered_products")
  .select("group_name")
  .eq("offered", true);
if (offErr) {
  console.error("❌ Selectie-tabel niet leesbaar:", offErr.message);
  console.error("   Heb je de migratie 20260604120000_shopify_offered_products.sql uitgevoerd?");
  process.exit(1);
}
const offeredSet = new Set((offeredRows || []).map((r) => r.group_name));
const beforeSel = products.length;
products = products.filter((p) => offeredSet.has(p.title));
console.log(`    Selectie: ${products.length} van ${beforeSel} producten staan aan in de webshop`);
if (products.length === 0 && !isLive) {
  console.log("\nℹ️  Nog niets geselecteerd. Zet producten aan op /admin/catalogus en draai opnieuw.");
  process.exit(0);
}
// In live-modus draaien we wél door bij 0 selectie: dan worden alle bestaande
// producten verborgen (de webshop wordt leeggemaakt).

const toSync = products.slice(0, limit === Infinity ? products.length : limit);

// ============================================================
// 4) Shopify
// ============================================================
const GQL_URL = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

async function getAccessToken() {
  if (TOKEN) return TOKEN;
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const raw = await res.text();
  let json = {};
  try { json = JSON.parse(raw); } catch {}
  if (!res.ok || !json.access_token) {
    console.error(`❌ Token ophalen mislukt (HTTP ${res.status}). Respons:`, raw || "(leeg)");
    process.exit(1);
  }
  console.log(`    🔑 Token opgehaald (scopes: ${json.scope || "?"})`);
  return json.access_token;
}

async function gql(query, variables, attempt = 1) {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429 && attempt <= 5) { await sleep(2000 * attempt); return gql(query, variables, attempt + 1); }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function findIdByHandle(handle) {
  const d = await gql(`query($q:String!){ products(first:1, query:$q){ nodes { id } } }`, { q: `handle:${handle}` });
  return d?.products?.nodes?.[0]?.id || null;
}


const PRODUCT_SET = `
mutation ProductSet($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product { id handle }
    userErrors { field message }
  }
}`;

// ----- DRY-RUN -----
if (!isLive) {
  console.log("\n[2] DRY-RUN — voorbeeld van producten + varianten:\n");
  for (const p of toSync.slice(0, 6)) {
    console.log(`  ■ ${p.title}  [${p.productType}] ${p._image ? "📷" : "—"}  handle=${p.handle}`);
    for (const v of p.variants) {
      const ov = v.optionValues.map((o) => o.name).join(" · ");
      console.log(`      - ${ov}  €${v.price}  (${v.inventoryItem.sku})`);
    }
  }
  console.log(`\n  ... en ${Math.max(0, toSync.length - 6)} andere producten.`);
  console.log("\nℹ️  Test klein: node --env-file=.env.local sync-shopify-products.mjs --limit=10 --live");
  process.exit(0);
}

// ----- LIVE -----
console.log("\n[2] Token ophalen...");
TOKEN = await getAccessToken();

// Eenmalige setup: Shopify-categorie + verkoopkanaal opzoeken (best-effort,
// blokkeert de sync niet als een scope ontbreekt).
let CATEGORY_ID = null;
try {
  const d = await gql(`query($q:String!){ taxonomy { categories(first:8, search:$q){ nodes { id fullName } } } }`, { q: "Houseplant" });
  const nodes = d?.taxonomy?.categories?.nodes || [];
  const pick = nodes.find((n) => /plant/i.test(n.fullName)) || nodes[0];
  if (pick) { CATEGORY_ID = pick.id; console.log(`    🏷️  Categorie: ${pick.fullName}`); }
  else console.warn("    ⚠️  Geen categorie gevonden voor 'Houseplant'.");
} catch (e) { console.warn("    ⚠️  Categorie opzoeken mislukt:", e.message); }

let PUBLICATION_ID = null;
try {
  const d = await gql(`{ publications(first:20){ nodes { id name } } }`, {});
  const nodes = d?.publications?.nodes || [];
  const pick = nodes.find((n) => /online store/i.test(n.name)) || nodes[0];
  if (pick) { PUBLICATION_ID = pick.id; console.log(`    📡 Verkoopkanaal: ${pick.name}`); }
  else console.warn("    ⚠️  Geen verkoopkanaal gevonden.");
} catch (e) { console.warn("    ⚠️  Kanalen opzoeken mislukt — voeg scope read_publications + write_publications toe. Detail:", e.message); }

if (doWipe) {
  console.log("\n[2a] ⚠️  Alle bestaande producten verwijderen...");
  let del = 0;
  for (;;) {
    const d = await gql(`{ products(first: 50) { nodes { id } } }`, {});
    const nodes = d.products.nodes;
    if (!nodes.length) break;
    for (const n of nodes) {
      await gql(`mutation($id:ID!){ productDelete(input:{id:$id}){ deletedProductId } }`, { id: n.id });
      del++; process.stdout.write(`\r    Verwijderd: ${del}`);
      await sleep(120);
    }
  }
  console.log(`\n    🗑️  ${del} producten verwijderd`);
}

console.log("\n[3] Producten pushen...");
let ok = 0, failed = 0;
for (let i = 0; i < toSync.length; i++) {
  const p = toSync[i];
  try {
    const id = await findIdByHandle(p.handle);
    const input = {
      title: p.title, handle: p.handle, vendor: p.vendor, productType: p.productType,
      status: p.status, productOptions: p.productOptions, variants: p.variants,
    };
    if (CATEGORY_ID) input.category = CATEGORY_ID;
    if (id) input.id = id;                       // bestaand product -> bijwerken
    else if (p._image) input.files = [{ originalSource: p._image, contentType: "IMAGE" }]; // foto enkel bij aanmaken
    const data = await gql(PRODUCT_SET, { input });
    const errs = data?.productSet?.userErrors || [];
    if (errs.length) { failed++; console.error(`\n    ❌ ${p.handle}: ${errs.map((e) => e.message).join("; ")}`); }
    else {
      ok++;
      // Publiceren op het verkoopkanaal (Online Store), zodat het in de webshop verschijnt.
      const prodId = data?.productSet?.product?.id;
      if (prodId && PUBLICATION_ID) {
        try {
          const pub = await gql(
            `mutation($id:ID!,$pubs:[PublicationInput!]!){ publishablePublish(id:$id, input:$pubs){ userErrors { message } } }`,
            { id: prodId, pubs: [{ publicationId: PUBLICATION_ID }] }
          );
          const pe = pub?.publishablePublish?.userErrors || [];
          if (pe.length && i === 0) console.warn(`\n    ⚠️  Publiceren: ${pe.map((e) => e.message).join("; ")}`);
        } catch (e) { if (i === 0) console.warn(`\n    ⚠️  Publiceren mislukt (scope write_publications?): ${e.message}`); }
      }
      process.stdout.write(`\r    Voortgang: ${ok} ok / ${failed} fout  (${i + 1}/${toSync.length})`);
    }
  } catch (e) {
    failed++; console.error(`\n    ❌ ${p.handle}: ${e.message}`);
    if (failed >= 5) { console.error("    Te veel fouten, stop."); process.exit(1); }
  }
  await sleep(150);
}
console.log("");

// ----- Reconcile: niet-geselecteerde producten VERWIJDEREN (echte spiegel) -----
// Veiligheid: enkel producten die deze sync zelf beheert (vendor === VENDOR),
// zodat een eventueel handmatig toegevoegd product nooit sneuvelt.
console.log("\n[4] Niet-geselecteerde producten verwijderen...");
const keep = new Set(products.map((p) => p.handle));
let removed = 0, cursor = null;
for (;;) {
  const d = await gql(
    `query($c:String){ products(first:100, after:$c){ nodes { id handle vendor } pageInfo { hasNextPage endCursor } } }`,
    { c: cursor }
  );
  for (const n of d.products.nodes) {
    if (keep.has(n.handle)) continue;
    if (n.vendor !== VENDOR) continue; // enkel onze eigen producten
    try {
      await gql(
        `mutation($id:ID!){ productDelete(input:{id:$id}){ deletedProductId userErrors{ message } } }`,
        { id: n.id }
      );
      removed++; process.stdout.write(`\r    Verwijderd: ${removed}`);
    } catch (e) { console.warn(`\n    ⚠️  ${n.handle} verwijderen mislukt: ${e.message}`); }
    await sleep(120);
  }
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
console.log(removed ? "" : "    (niets te verwijderen)");

console.log("\n" + "=".repeat(60));
console.log(`✅ Klaar. Producten: ${ok} ok, ${failed} fout. Verwijderd: ${removed}`);
console.log("=".repeat(60));
