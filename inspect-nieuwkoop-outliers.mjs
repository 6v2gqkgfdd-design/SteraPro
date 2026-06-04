#!/usr/bin/env node
/**
 * Read-only: graaft dieper in de Nieuwkoop-structuur om groepering te ontwerpen.
 *  - grootste "naam"-groepen (uitschieters opsporen)
 *  - inhoud van de allergrootste groep
 *  - wat verschilt er tussen twee schijnbaar identieke items (zelfde naam/hoogte/teelt)?
 * Wijzigt NIETS.
 *
 *   node --env-file=.env.local inspect-nieuwkoop-outliers.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const COLS = "itemcode, description, item_variety_nl, pot_size, diameter, height, width, depth, length, diameter_culture_pot, height_culture_pot, sales_package_nl, sales_order_size, sales_price, gtin_code, location_icon_nl, is_stock_item, delivery_time_in_days, product_group_description_nl, main_group_description_nl";

const PAGE = 1000;
let rows = [];
let from = 0;
for (;;) {
  const { data, error } = await supabase
    .from("nieuwkoop_products")
    .select(COLS)
    .eq("show_on_website", true)
    .range(from, from + PAGE - 1);
  if (error) { console.error("❌", error.message); process.exit(1); }
  rows = rows.concat(data || []);
  if (!data || data.length < PAGE) break;
  from += PAGE;
}

const groups = new Map();
for (const r of rows) {
  const key = (r.description || "(geen naam)").trim();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

console.log("=".repeat(70));
console.log("UITSCHIETERS: 15 grootste namen (op aantal items)");
console.log("=".repeat(70));
for (const [name, g] of sorted.slice(0, 15)) {
  console.log(`${String(g.length).padStart(4)}  ${name}   [${g[0].product_group_description_nl || "?"} / ${g[0].main_group_description_nl || "?"}]`);
}

const [bigName, bigGroup] = sorted[0];
console.log("\n" + "=".repeat(70));
console.log(`INHOUD grootste groep: "${bigName}" (${bigGroup.length} items) — eerste 12`);
console.log("=".repeat(70));
for (const r of bigGroup.slice(0, 12)) {
  console.log(`  ${r.itemcode}  H:${r.height ?? "-"} Ø:${r.diameter ?? "-"} L:${r.length ?? "-"} variety:${r.item_variety_nl ?? "-"} pkg:${r.sales_package_nl ?? "-"} €${r.sales_price ?? "-"}`);
}

// Zoek een groep met twee items die gelijk zijn op (height, variety) en toon het verschil.
console.log("\n" + "=".repeat(70));
console.log("SCHIJNBARE DUBBEL: wat verschilt er tussen twee 'gelijke' items?");
console.log("=".repeat(70));
let shown = false;
for (const [name, g] of groups) {
  if (shown) break;
  const seen = new Map();
  for (const r of g) {
    const k = `${r.height}|${r.item_variety_nl}|${r.diameter}`;
    if (seen.has(k)) {
      const a = seen.get(k), b = r;
      console.log(`Naam: ${name}`);
      console.log(`Sleutel (height|variety|diameter): ${k}\n`);
      const keys = Object.keys(a);
      for (const key of keys) {
        const va = JSON.stringify(a[key]); const vb = JSON.stringify(b[key]);
        const mark = va === vb ? "   " : ">> ";
        console.log(`${mark}${key.padEnd(28)} ${a.itemcode}=${va}   |   ${b.itemcode}=${vb}`);
      }
      shown = true;
      break;
    }
    seen.set(k, r);
  }
}
if (!shown) console.log("(geen exacte dubbels gevonden op height|variety|diameter)");
console.log("\n" + "=".repeat(70));
