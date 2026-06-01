#!/usr/bin/env node
/**
 * Sync Nieuwkoop /items endpoint naar Supabase nieuwkoop_products tabel.
 *
 * Synct ENKEL combinaties (plant + pot, binnen + buiten) met substraat
 * Grond/Hydrokorrels/Bims. Zie filter ALLOWED_SUBSTRATES hieronder.
 *
 * Gebruik:
 *   node --env-file=.env.local sync-nieuwkoop-items.mjs              # dry-run: eerste 100 matches
 *   node --env-file=.env.local sync-nieuwkoop-items.mjs --full       # alle matches (~1967)
 *   node --env-file=.env.local sync-nieuwkoop-items.mjs --since=2026-05-01   # alleen wijzigingen sinds datum
 *
 * Vereisten in .env.local:
 *   NIEUWKOOP_API_BASE_URL=https://customerapi_dev.nieuwkoop-europe.com
 *   NIEUWKOOP_API_USER=...
 *   NIEUWKOOP_API_PASSWORD=...
 *   NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...   <-- niet de anon key!
 */

import { createClient } from "@supabase/supabase-js";

// ============================================================
// Config + arg parsing
// ============================================================
const args = process.argv.slice(2);
const isFull = args.includes("--full");
const sinceArg = args.find(a => a.startsWith("--since="));
const sinceDate = sinceArg ? sinceArg.split("=")[1] : "2020-01-01";

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
  console.error("❌ Ontbrekende env vars in .env.local:", missing.join(", "));
  process.exit(1);
}

const authHeader = "Basic " + Buffer.from(`${NK_USER}:${NK_PASS}`).toString("base64");
const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

console.log("=".repeat(60));
console.log("Nieuwkoop -> Supabase sync");
console.log("=".repeat(60));
console.log("Modus:        ", isFull ? "FULL CATALOG" : "DRY-RUN (eerste 100 items)");
console.log("Sysmodified:  ", sinceDate);
console.log("Supabase URL: ", SUPA_URL);
console.log("=".repeat(60));

// ============================================================
// 1) Items ophalen van Nieuwkoop
// ============================================================
console.log("\n[1] Items ophalen van Nieuwkoop...");
const tStart = Date.now();

const url = `${NK_BASE}/items?sysmodified=${sinceDate}`;

// De live-catalogus is groot (~18k items in één JSON-respons). Dat kan
// traag zijn, dus: ruime time-out van 3 minuten + één automatische retry.
const FETCH_TIMEOUT_MS = 180_000;

async function fetchItems(attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`❌ Nieuwkoop API gaf HTTP ${res.status}`);
      console.error(await res.text());
      process.exit(1);
    }
    return await res.json();
  } catch (e) {
    const reason = e?.name === "AbortError"
      ? `time-out na ${FETCH_TIMEOUT_MS / 1000}s`
      : (e?.message || "netwerkfout");
    if (attempt < 2) {
      console.warn(`    ⚠️  Ophalen mislukt (${reason}). Nog één poging...`);
      return fetchItems(attempt + 1);
    }
    console.error(`❌ Ophalen definitief mislukt: ${reason}`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

const items = await fetchItems();
const tFetch = ((Date.now() - tStart) / 1000).toFixed(1);
console.log(`    ✅ ${items.length} items opgehaald in ${tFetch}s`);

// ============================================================
// 1b) Filter: enkel combinaties (plant + pot, met watermeter) voor
//     buiten, met een substraat dat bij combinaties bestaat.
//     Vulkaponic/Vulkastrat komen niet voor bij combinaties; het
//     vulkanische substraat is hier 'Bims'.
// ============================================================
const ALLOWED_SUBSTRATES = ["Grond", "Hydrokorrels", "Bims"];
const REQUIRE_OUTDOOR = false; // false = zowel binnen- als buiten-combinaties

// Moswanden (ook groep 275) herkennen we — net als de catalogus-pagina —
// aan een mos-woord in ItemVariety_NL. Die hebben geen substraat, maar
// willen we wél aanbieden.
const MOS_WORDS = ["bolmos", "platmos", "rendiermos", "bol- en"];

function tagValues(item, code) {
  const tag = (item.Tags || []).find((t) => t?.Code === code);
  return tag ? (tag.Values || []).map((v) => v?.Description_NL).filter(Boolean) : [];
}

function isMoswand(it) {
  if (String(it.ProductGroupCode) !== "275") return false;
  const v = (it.ItemVariety_NL || "").toLowerCase();
  return MOS_WORDS.some((w) => v.includes(w));
}

function isCombiWithSubstrate(it) {
  if ((it.GroupDescription_NL || "").trim() !== "Combinaties") return false;
  const subs = tagValues(it, "SubstrateType");
  if (!subs.some((s) => ALLOWED_SUBSTRATES.includes(s))) return false;
  if (REQUIRE_OUTDOOR && !tagValues(it, "Location").includes("Buiten")) return false;
  return true;
}

// We willen: combinaties met toegelaten substraat + alle moswanden.
function isWantedCombo(it) {
  return isCombiWithSubstrate(it) || isMoswand(it);
}

const combos = items.filter(isWantedCombo);
const moswandCount = combos.filter(isMoswand).length;
console.log(`    Na filter: ${combos.length} van ${items.length} items`);
console.log(`    (combinaties substraat ∈ ${ALLOWED_SUBSTRATES.join("/")} + ${moswandCount} moswanden)`);

// Beperken in dry-run modus
const toSync = isFull ? combos : combos.slice(0, 100);
console.log(`    Te syncen: ${toSync.length} items`);

// ============================================================
// 2) Mapping: Nieuwkoop velden -> Supabase kolommen
// ============================================================
console.log("\n[2] Velden mappen + voorbereiden voor upsert...");

function toTimestamp(s) {
  if (!s) return null;
  // Nieuwkoop geeft "2023-10-17T09:02:11.4" - geen tijdzone. Behandel als UTC.
  return s.includes("Z") ? s : s + "Z";
}

const rows = toSync.map(it => ({
  itemcode: it.Itemcode,
  description: it.Description,
  item_description_nl: it.ItemDescription_NL,
  item_status: it.ItemStatus,
  sales_price: it.Salesprice,
  main_group_code: it.MainGroupCode,
  main_group_description_nl: it.MainGroupDescription_NL,
  product_group_code: it.ProductGroupCode,
  product_group_description_nl: it.ProductGroupDescription_NL,
  group_description: it.GroupDescription,
  group_description_nl: it.GroupDescription_NL,
  item_variety_nl: it.ItemVariety_NL,
  pot_size: it.PotSize,
  sales_package_nl: it.SalesPackage_NL?.trim() || null,
  sales_order_size: it.SalesOrderSize,
  diameter: it.Diameter,
  width: it.Width,
  height: it.Height,
  depth: it.Depth,
  length: it.Length,
  opening: it.Opening,
  weight: it.Weight,
  diameter_culture_pot: it.DiameterCulturePot,
  height_culture_pot: it.HeightCulturePot,
  location_icon_nl: it.LocationIcon_NL,
  location_usage_planters_nl: it.LocationUsagePlanters_NL,
  item_picture_name: it.ItemPictureName,
  item_picture_sysmodified: toTimestamp(it.ItemPictureSysmodified),
  is_stock_item: it.IsStockItem,
  warehouse: it.Warehouse,
  show_on_website: it.ShowOnWebsite,
  is_offer: it.IsOffer,
  delivery_time_in_days: it.DeliveryTimeInDays,
  quantity_pallet: it.QuantityPallet,
  quantity_trolley: it.QuantityTrolley,
  country_of_origin: it.CountryOfOrigin,
  country_of_provenance: it.CountryOfProvenance,
  cites_listed: it.CitesListed,
  fyto_listed: it.FytoListed,
  plant_passport_code: it.PlantPassportCode,
  gtin_code: it.GTINCode,
  hs_code: it.HSCode ? String(it.HSCode) : null,
  hs_code_uk: it.HSCodeUK,
  tags: it.Tags || [],
  raw_data: it,
  sysmodified: toTimestamp(it.Sysmodified),
  synced_at: new Date().toISOString(),
}));

console.log(`    ✅ ${rows.length} rijen klaar voor upsert`);

// ============================================================
// 3) Batched upsert naar Supabase
// ============================================================
console.log("\n[3] Upsert naar Supabase nieuwkoop_products...");
const BATCH_SIZE = 500;
let inserted = 0;
let errors = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const { error } = await supabase
    .from("nieuwkoop_products")
    .upsert(batch, { onConflict: "itemcode" });

  if (error) {
    errors++;
    console.error(`    ❌ Batch ${i}-${i+batch.length} fout:`, error.message);
    if (errors >= 3) {
      console.error("    Te veel errors, stop sync");
      process.exit(1);
    }
  } else {
    inserted += batch.length;
    process.stdout.write(`\r    Voortgang: ${inserted} / ${rows.length}`);
  }
}
console.log("");

// ============================================================
// 4) Snelle verificatie
// ============================================================
const { count } = await supabase
  .from("nieuwkoop_products")
  .select("*", { count: "exact", head: true });

console.log("\n" + "=".repeat(60));
console.log(`✅ Sync klaar. Geüpsert: ${inserted}, errors: ${errors}`);
console.log(`✅ Totaal in nieuwkoop_products tabel: ${count} items`);
console.log("=".repeat(60));

if (!isFull) {
  console.log("\nℹ️  Dit was een DRY-RUN met 100 items.");
  console.log("   Tevreden? Run dan: node --env-file=.env.local sync-nieuwkoop-items.mjs --full");
}
