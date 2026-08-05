#!/usr/bin/env node
/**
 * Sync Nieuwkoop /items → Supabase nieuwkoop_products (FULL catalog by default).
 *
 * Schrijft ook catalog_changes (new / price_changed / spec_changed / discontinued)
 * wanneer die tabel bestaat (migratie 20260805120000).
 *
 * Gebruik:
 *   node --env-file=.env.local sync-nieuwkoop-items.mjs              # dry-run: eerste 100
 *   node --env-file=.env.local sync-nieuwkoop-items.mjs --full       # ALLE items
 *   node --env-file=.env.local sync-nieuwkoop-items.mjs --full --live-changes
 *   node --env-file=.env.local sync-nieuwkoop-items.mjs --since=2026-08-01
 *   node --env-file=.env.local sync-nieuwkoop-items.mjs --combos-only # oude filter
 *
 * Env: NIEUWKOOP_API_*, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const isFull = args.includes("--full");
const combosOnly = args.includes("--combos-only");
const writeChanges = args.includes("--live-changes") || isFull;
const sinceArg = args.find((a) => a.startsWith("--since="));
const sinceDate = sinceArg ? sinceArg.split("=")[1] : "2000-01-01";

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
console.log("Nieuwkoop -> Supabase sync (full catalog)");
console.log("=".repeat(60));
console.log("Modus:        ", isFull ? "FULL" : "DRY-RUN (eerste 100)");
console.log("Filter:       ", combosOnly ? "combinaties + moswanden (legacy)" : "ALLE items");
console.log("Sysmodified:  ", sinceDate);
console.log("Changes:      ", writeChanges ? "ja" : "nee");
console.log("=".repeat(60));

const FETCH_TIMEOUT_MS = 180_000;
async function fetchItems(attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${NK_BASE}/items?sysmodified=${sinceDate}`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`❌ Nieuwkoop API HTTP ${res.status}`);
      console.error(await res.text());
      process.exit(1);
    }
    return await res.json();
  } catch (e) {
    const reason = e?.name === "AbortError" ? `time-out na ${FETCH_TIMEOUT_MS / 1000}s` : e?.message || "netwerkfout";
    if (attempt < 2) {
      console.warn(`    ⚠️  Ophalen mislukt (${reason}). Retry...`);
      return fetchItems(attempt + 1);
    }
    console.error(`❌ Ophalen mislukt: ${reason}`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

console.log("\n[1] Items ophalen van Nieuwkoop...");
const tStart = Date.now();
const items = await fetchItems();
console.log(`    ✅ ${items.length} items in ${((Date.now() - tStart) / 1000).toFixed(1)}s`);

// Legacy filter (optioneel)
const ALLOWED_SUBSTRATES = ["Grond", "Hydrokorrels", "Bims"];
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
function isWantedCombo(it) {
  if ((it.GroupDescription_NL || "").trim() === "Combinaties") {
    const subs = tagValues(it, "SubstrateType");
    return subs.some((s) => ALLOWED_SUBSTRATES.includes(s));
  }
  return isMoswand(it);
}

const filtered = combosOnly ? items.filter(isWantedCombo) : items.filter((it) => it?.Itemcode);
console.log(`    Te verwerken: ${filtered.length}${combosOnly ? " (na filter)" : ""}`);

const toSync = isFull ? filtered : filtered.slice(0, 100);
console.log(`    Te syncen: ${toSync.length}`);

function toTimestamp(s) {
  if (!s) return null;
  return s.includes("Z") ? s : s + "Z";
}

const now = new Date().toISOString();

function mapRow(it) {
  return {
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
    synced_at: now,
    last_seen_at: now,
    is_active_at_source: true,
    discontinued_at: null,
  };
}

// Bestaande rijen voor change-detectie
console.log("\n[2] Bestaande catalogus laden...");
const existing = new Map();
{
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("nieuwkoop_products")
      .select("itemcode, sales_price, description, height, diameter, item_variety_nl, pot_size, item_picture_name, product_group_code, main_group_code, is_active_at_source")
      .range(from, from + 999);
    if (error) {
      // Kolommen bestaan mogelijk nog niet → fallback zonder tracking
      if (error.message.includes("is_active_at_source") || error.message.includes("does not exist")) {
        console.warn("    ⚠️  Tracking-kolommen ontbreken — migratie 20260805120000 nog toepassen.");
        const { data: d2, error: e2 } = await supabase
          .from("nieuwkoop_products")
          .select("itemcode, sales_price, description, height, diameter, item_variety_nl, pot_size, item_picture_name, product_group_code, main_group_code")
          .range(from, from + 999);
        if (e2) { console.error(e2.message); process.exit(1); }
        if (!d2?.length) break;
        for (const r of d2) existing.set(r.itemcode, { ...r, is_active_at_source: true });
        if (d2.length < 1000) break;
        from += 1000;
        continue;
      }
      console.error(error.message);
      process.exit(1);
    }
    if (!data?.length) break;
    for (const r of data) existing.set(r.itemcode, r);
    if (data.length < 1000) break;
    from += 1000;
  }
}
console.log(`    ✅ ${existing.size} bestaande items`);

function specsFp(r) {
  return [r.description ?? "", r.height ?? "", r.diameter ?? "", r.item_variety_nl ?? "", r.pot_size ?? "", r.item_picture_name ?? "", r.product_group_code ?? "", r.main_group_code ?? ""].join("|");
}

const rows = [];
const changeRows = [];
const counts = { new: 0, price_changed: 0, spec_changed: 0, discontinued: 0 };

for (const it of toSync) {
  const row = mapRow(it);
  // Zonder tracking-kolommen: strip optionele velden bij upsert-fout later
  rows.push(row);

  if (!writeChanges) continue;
  const prev = existing.get(row.itemcode);
  if (!prev) {
    changeRows.push({
      itemcode: row.itemcode,
      change_type: "new",
      summary: `Nieuw artikel: ${row.description || row.itemcode}`,
      before_data: null,
      after_data: { sales_price: row.sales_price, description: row.description },
    });
    counts.new++;
    continue;
  }
  if (Number(prev.sales_price) !== Number(row.sales_price)) {
    changeRows.push({
      itemcode: row.itemcode,
      change_type: "price_changed",
      summary: `Prijs ${prev.sales_price ?? "—"} → ${row.sales_price ?? "—"}`,
      before_data: { sales_price: prev.sales_price },
      after_data: { sales_price: row.sales_price },
    });
    counts.price_changed++;
  }
  if (specsFp(prev) !== specsFp(row)) {
    changeRows.push({
      itemcode: row.itemcode,
      change_type: "spec_changed",
      summary: `Specs gewijzigd: ${row.description || row.itemcode}`,
      before_data: { description: prev.description, height: prev.height, diameter: prev.diameter },
      after_data: { description: row.description, height: row.height, diameter: row.diameter },
    });
    counts.spec_changed++;
  }
}

console.log("\n[3] Upsert naar nieuwkoop_products...");
const BATCH = 500;
let inserted = 0;
let errors = 0;
let stripTracking = false;

for (let i = 0; i < rows.length; i += BATCH) {
  let batch = rows.slice(i, i + BATCH);
  if (stripTracking) {
    batch = batch.map(({ last_seen_at, is_active_at_source, discontinued_at, ...rest }) => rest);
  }
  const { error } = await supabase.from("nieuwkoop_products").upsert(batch, { onConflict: "itemcode" });
  if (error) {
    if (!stripTracking && (error.message.includes("last_seen_at") || error.message.includes("is_active_at_source") || error.message.includes("schema cache"))) {
      console.warn("    ⚠️  Tracking-kolommen niet beschikbaar — upsert zonder tracking-velden.");
      stripTracking = true;
      i -= BATCH;
      continue;
    }
    errors++;
    console.error(`    ❌ Batch ${i}:`, error.message);
    if (errors >= 3) process.exit(1);
  } else {
    inserted += batch.length;
    process.stdout.write(`\r    Voortgang: ${inserted} / ${rows.length}`);
  }
}
console.log("");

// Full: discontinued markeren
if (isFull && !combosOnly && !stripTracking) {
  console.log("\n[4] Verdwenen items markeren...");
  const seen = new Set(toSync.map((it) => it.Itemcode));
  const missing = [...existing.entries()].filter(([code, r]) => r.is_active_at_source !== false && !seen.has(code));
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const codes = batch.map(([c]) => c);
    const { error } = await supabase
      .from("nieuwkoop_products")
      .update({ is_active_at_source: false, discontinued_at: now, synced_at: now })
      .in("itemcode", codes);
    if (error) {
      console.warn("    ⚠️  Discontinued update:", error.message);
      break;
    }
    for (const [code, r] of batch) {
      changeRows.push({
        itemcode: code,
        change_type: "discontinued",
        summary: `Niet meer in feed: ${r.description || code}`,
        before_data: { is_active_at_source: true },
        after_data: { is_active_at_source: false },
      });
      counts.discontinued++;
    }
  }
  console.log(`    ✅ ${counts.discontinued} discontinued`);
}

if (writeChanges && changeRows.length) {
  console.log(`\n[5] Change-inbox: ${changeRows.length} events...`);
  for (let i = 0; i < changeRows.length; i += BATCH) {
    const { error } = await supabase.from("catalog_changes").insert(changeRows.slice(i, i + BATCH));
    if (error) {
      console.warn("    ⚠️  catalog_changes:", error.message);
      console.warn("       → Pas migratie 20260805120000_catalog_full_tracking.sql toe in Supabase.");
      break;
    }
  }
  console.log(`    new=${counts.new} price=${counts.price_changed} specs=${counts.spec_changed} disc=${counts.discontinued}`);
}

const { count } = await supabase.from("nieuwkoop_products").select("*", { count: "exact", head: true });
console.log("\n" + "=".repeat(60));
console.log(`✅ Klaar. Geüpsert: ${inserted}, errors: ${errors}`);
console.log(`✅ Totaal in nieuwkoop_products: ${count}`);
console.log("=".repeat(60));
if (!isFull) {
  console.log("\nℹ️  DRY-RUN. Full: node --env-file=.env.local sync-nieuwkoop-items.mjs --full");
}
