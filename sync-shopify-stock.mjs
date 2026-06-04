#!/usr/bin/env node
/**
 * Sync voorraad Supabase (nieuwkoop_stock) -> Shopify inventory.
 *
 * Zet per variant (gematcht op SKU = itemcode) het beschikbare aantal op de
 * winkel-locatie, gelijk aan stock_available uit Nieuwkoop. Draai dit los van
 * de product-sync (voorraad wijzigt dagelijks) — ideaal als geplande taak.
 *
 * Vereist dat de producten al gesynct zijn met voorraad-tracking aan
 * (sync-shopify-products.mjs doet dat: inventoryItem.tracked = true).
 *
 * Gebruik:
 *   node --env-file=.env.local sync-shopify-stock.mjs            # DRY-RUN
 *   node --env-file=.env.local sync-shopify-stock.mjs --live     # echt toepassen
 *
 * Extra Shopify-scopes nodig: read_inventory, write_inventory, read_locations
 * (naast read_products). Voeg ze toe in het Dev Dashboard en herinstalleer.
 */

import { createClient } from "@supabase/supabase-js";

const isLive = process.argv.includes("--live");
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
let TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

const missing = [];
if (!SUPA_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!SUPA_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (!SHOP) missing.push("SHOPIFY_STORE_DOMAIN");
if (!TOKEN && !(CLIENT_ID && CLIENT_SECRET)) missing.push("SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET");
if (missing.length) { console.error("❌ Ontbrekende env vars:", missing.join(", ")); process.exit(1); }

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const GQL_URL = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("=".repeat(60));
console.log("Voorraad Supabase -> Shopify");
console.log("Modus:", isLive ? "🔴 LIVE" : "🟢 DRY-RUN (schrijft niets)");
console.log("=".repeat(60));

async function getToken() {
  if (TOKEN) return TOKEN;
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const raw = await res.text();
  let j = {}; try { j = JSON.parse(raw); } catch {}
  if (!res.ok || !j.access_token) { console.error(`❌ Token mislukt (HTTP ${res.status}):`, raw || "(leeg)"); process.exit(1); }
  console.log(`    🔑 Token (scopes: ${j.scope || "?"})`);
  return j.access_token;
}

async function gql(query, variables, attempt = 1) {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429 && attempt <= 5) { await sleep(2000 * attempt); return gql(query, variables, attempt + 1); }
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// 1) Voorraad uit Supabase
console.log("\n[1] Voorraad ophalen uit nieuwkoop_stock...");
let stockRows = [], from = 0;
for (;;) {
  const { data, error } = await supabase.from("nieuwkoop_stock").select("itemcode, stock_available").range(from, from + 999);
  if (error) { console.error("❌", error.message); process.exit(1); }
  stockRows = stockRows.concat(data || []);
  if (!data || data.length < 1000) break;
  from += 1000;
}
const stockByCode = new Map(stockRows.map((r) => [r.itemcode, Math.max(0, Math.floor(Number(r.stock_available ?? 0)))]));
console.log(`    ✅ ${stockByCode.size} voorraad-rijen`);

if (!isLive) {
  console.log("\n[2] DRY-RUN — voorbeeld (eerste 10):");
  let i = 0;
  for (const [code, qty] of stockByCode) { console.log(`    ${code}: ${qty}`); if (++i >= 10) break; }
  console.log("\nℹ️  Toepassen: node --env-file=.env.local sync-shopify-stock.mjs --live");
  process.exit(0);
}

TOKEN = await getToken();

// 2) Locatie
const locData = await gql(`{ locations(first: 1) { nodes { id name } } }`, {});
const location = locData?.locations?.nodes?.[0];
if (!location) { console.error("❌ Geen winkel-locatie gevonden."); process.exit(1); }
console.log(`\n[2] Locatie: ${location.name}`);

// 3) SKU -> inventoryItem map (enkel getrackte varianten)
console.log("[3] Varianten ophalen uit Shopify...");
const invByCode = new Map();
let cursor = null;
for (;;) {
  const d = await gql(
    `query($c:String){ productVariants(first:200, after:$c){ nodes { sku inventoryItem { id tracked } } pageInfo { hasNextPage endCursor } } }`,
    { c: cursor }
  );
  for (const v of d.productVariants.nodes) {
    if (v.sku && v.inventoryItem?.tracked) invByCode.set(v.sku, v.inventoryItem.id);
  }
  if (!d.productVariants.pageInfo.hasNextPage) break;
  cursor = d.productVariants.pageInfo.endCursor;
}
console.log(`    ✅ ${invByCode.size} getrackte varianten`);

// 4) Aantallen bouwen + in batches zetten
const quantities = [];
for (const [code, qty] of stockByCode) {
  const invId = invByCode.get(code);
  if (invId) quantities.push({ inventoryItemId: invId, locationId: location.id, quantity: qty });
}
console.log(`\n[4] ${quantities.length} varianten bijwerken...`);

let done = 0, failed = 0;
for (let i = 0; i < quantities.length; i += 200) {
  const batch = quantities.slice(i, i + 200);
  try {
    const d = await gql(
      `mutation($input: InventorySetQuantitiesInput!){ inventorySetQuantities(input:$input){ userErrors { message } } }`,
      { input: { name: "available", reason: "correction", ignoreCompareQuantity: true, quantities: batch } }
    );
    const errs = d?.inventorySetQuantities?.userErrors || [];
    if (errs.length) { failed += batch.length; console.error(`\n    ❌ batch: ${errs.map((e) => e.message).join("; ")}`); }
    else { done += batch.length; process.stdout.write(`\r    Bijgewerkt: ${done}/${quantities.length}`); }
  } catch (e) { failed += batch.length; console.error(`\n    ❌ batch fout: ${e.message}`); }
  await sleep(200);
}
console.log("");
console.log("\n" + "=".repeat(60));
console.log(`✅ Klaar. Bijgewerkt: ${done}, fout: ${failed}`);
console.log("=".repeat(60));
