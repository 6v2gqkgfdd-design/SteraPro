#!/usr/bin/env node
/**
 * Sync Nieuwkoop voorraad (/stock) naar de Supabase-tabel nieuwkoop_stock.
 *
 * Het /stock-endpoint geeft de voorraad voor de HELE catalogus (~24,5k),
 * maar onze nieuwkoop_products bevat enkel de ~1967 combinaties. De FK
 * dwingt af dat we alleen voor die itemcodes schrijven, dus filteren we.
 *
 * Gebruik:
 *   node --env-file=.env.local sync-nieuwkoop-stock.mjs
 *
 * Vereist in .env.local:
 *   NIEUWKOOP_API_BASE_URL / NIEUWKOOP_API_USER / NIEUWKOOP_API_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const NK_BASE = process.env.NIEUWKOOP_API_BASE_URL;
const NK_USER = process.env.NIEUWKOOP_API_USER;
const NK_PASS = process.env.NIEUWKOOP_API_PASSWORD;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!NK_BASE) missing.push("NIEUWKOOP_API_BASE_URL");
if (!NK_USER) missing.push("NIEUWKOOP_API_USER");
if (!NK_PASS) missing.push("NIEUWKOOP_API_PASSWORD");
if (!SUPA_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!SUPA_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (missing.length) {
  console.error("❌ Ontbrekende env vars:", missing.join(", "));
  process.exit(1);
}

const authHeader = "Basic " + Buffer.from(`${NK_USER}:${NK_PASS}`).toString("base64");
const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

console.log("=".repeat(60));
console.log("Nieuwkoop voorraad -> Supabase nieuwkoop_stock");
console.log("=".repeat(60));

// 1) Voorraad ophalen (met ruime time-out + 1 retry)
const FETCH_TIMEOUT_MS = 180_000;
async function fetchStock(attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${NK_BASE}/stock?sysmodified=2000-01-01`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`❌ Nieuwkoop /stock gaf HTTP ${res.status}`);
      console.error((await res.text()).slice(0, 300));
      process.exit(1);
    }
    return await res.json();
  } catch (e) {
    const reason = e?.name === "AbortError" ? `time-out na ${FETCH_TIMEOUT_MS / 1000}s` : (e?.message || "netwerkfout");
    if (attempt < 2) {
      console.warn(`    ⚠️  Ophalen mislukt (${reason}). Nog één poging...`);
      return fetchStock(attempt + 1);
    }
    console.error(`❌ Ophalen definitief mislukt: ${reason}`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

console.log("\n[1] Voorraad ophalen van Nieuwkoop...");
const stock = await fetchStock();
console.log(`    ✅ ${stock.length} voorraad-records opgehaald`);

// 2) Welke itemcodes zitten in onze catalogus? (gepagineerd)
console.log("\n[2] Itemcodes uit nieuwkoop_products ophalen...");
const known = new Set();
{
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("nieuwkoop_products")
      .select("itemcode")
      .range(from, from + pageSize - 1);
    if (error) { console.error("❌ Supabase fout:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data) known.add(r.itemcode);
    if (data.length < pageSize) break;
    from += pageSize;
  }
}
console.log(`    ✅ ${known.size} itemcodes in catalogus`);

// 3) Filteren + mappen
function toTimestamp(s) {
  if (!s) return null;
  return s.includes("Z") ? s : s + "Z";
}
const rows = stock
  .filter((s) => s?.Itemcode && known.has(s.Itemcode))
  .map((s) => ({
    itemcode: s.Itemcode,
    stock_available: Number.isFinite(s.StockAvailable) ? s.StockAvailable : 0,
    first_available: s.FirstAvailable ?? null,
    sysmodified: toTimestamp(s.Sysmodified),
    synced_at: new Date().toISOString(),
  }));

const inStock = rows.filter((r) => r.stock_available > 0).length;
console.log(`\n[3] ${rows.length} records matchen onze combinaties (${inStock} met voorraad > 0).`);

// 4) Upsert in batches
console.log("\n[4] Upsert naar nieuwkoop_stock...");
const BATCH = 500;
let done = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await supabase.from("nieuwkoop_stock").upsert(batch, { onConflict: "itemcode" });
  if (error) { console.error(`\n❌ Batch ${i} fout:`, error.message); process.exit(1); }
  done += batch.length;
  process.stdout.write(`\r    Voortgang: ${done} / ${rows.length}`);
}

const { count } = await supabase.from("nieuwkoop_stock").select("*", { count: "exact", head: true });
console.log("\n\n" + "=".repeat(60));
console.log(`✅ Sync klaar. Geüpsert: ${done}, met voorraad: ${inStock}`);
console.log(`✅ Totaal in nieuwkoop_stock: ${count}`);
console.log("=".repeat(60));
