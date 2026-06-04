#!/usr/bin/env node
/**
 * Read-only: toont hoe Nieuwkoop-combinaties per "naam" (description) in maten
 * uiteenvallen, zodat we kunnen beslissen hoe we groeperen tot Shopify-producten
 * met varianten. Wijzigt NIETS.
 *
 *   node --env-file=.env.local inspect-nieuwkoop-structure.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// Verkoopklare items ophalen (zelfde basis als de sync).
const PAGE = 1000;
let rows = [];
let from = 0;
for (;;) {
  const { data, error } = await supabase
    .from("nieuwkoop_products")
    .select("itemcode, description, item_variety_nl, pot_size, diameter, height, width, length, product_group_description_nl, show_on_website")
    .eq("show_on_website", true)
    .order("description", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) { console.error("❌", error.message); process.exit(1); }
  rows = rows.concat(data || []);
  if (!data || data.length < PAGE) break;
  from += PAGE;
}

// Groeperen op description (de combinatie-naam).
const groups = new Map();
for (const r of rows) {
  const key = (r.description || "(geen naam)").trim();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

const sizes = [...groups.values()].map((g) => g.length);
const multi = [...groups.entries()].filter(([, g]) => g.length > 1);

console.log("=".repeat(64));
console.log("Nieuwkoop-structuur (verkoopklaar, gegroepeerd op naam/description)");
console.log("=".repeat(64));
console.log("Totaal items:            ", rows.length);
console.log("Unieke namen (=producten):", groups.size);
console.log("Namen met meerdere maten: ", multi.length);
console.log("Grootste groep:           ", Math.max(...sizes), "maten");
console.log("Gem. maten per naam:      ", (rows.length / groups.size).toFixed(2));

console.log("\n— 6 voorbeelden van namen met meerdere maten —");
for (const [name, g] of multi.slice(0, 6)) {
  console.log(`\n■ ${name}  (${g.length} maten)  [groep: ${g[0].product_group_description_nl || "?"}]`);
  for (const r of g.sort((a, b) => (a.height || 0) - (b.height || 0))) {
    console.log(
      `   ${r.itemcode}  H:${r.height ?? "-"}  Ø:${r.diameter ?? "-"}  pot_size:${r.pot_size ?? "-"}  L:${r.length ?? "-"}  variety:${r.item_variety_nl ?? "-"}`
    );
  }
}
console.log("\n" + "=".repeat(64));
