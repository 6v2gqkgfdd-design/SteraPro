#!/usr/bin/env node
/**
 * Maakt de Supabase Storage bucket "nieuwkoop-images" leeg.
 *
 * De image-route (app/api/nieuwkoop/image/[itemcode]) cachet elke
 * productfoto als {itemcode}.png in deze bucket. Door testen is die
 * volgelopen (~1,3 GB) en zit je org over de Free-limiet (1 GB).
 *
 * Leegmaken is VEILIG: ontbrekende foto's worden bij het volgende
 * gebruik automatisch opnieuw opgehaald van Nieuwkoop en gecachet.
 *
 * Gebruik:
 *   node --env-file=.env.local purge-nieuwkoop-images.mjs            # DRY-RUN: telt alleen
 *   node --env-file=.env.local purge-nieuwkoop-images.mjs --delete   # verwijdert echt
 *
 * Vereist in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET = "nieuwkoop-images";
const doDelete = process.argv.includes("--delete");

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ Ontbrekende env vars: NEXT_PUBLIC_SUPABASE_URL en/of SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

console.log("=".repeat(60));
console.log(`Bucket leegmaken: "${BUCKET}"`);
console.log("Modus:", doDelete ? "VERWIJDEREN" : "DRY-RUN (alleen tellen)");
console.log("=".repeat(60));

// 1) Alle bestandsnamen verzamelen (gepagineerd)
async function listAll() {
  const all = [];
  const limit = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list("", { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) {
      console.error("❌ Fout bij list:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const f of data) {
      // alleen echte bestanden (folders hebben id === null)
      if (f?.name && f.id) all.push(f.name);
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

const files = await listAll();
console.log(`\nGevonden bestanden: ${files.length}`);

if (files.length === 0) {
  console.log("✅ Bucket is al leeg, niets te doen.");
  process.exit(0);
}

if (!doDelete) {
  console.log("\nℹ️  DRY-RUN. Er is niets verwijderd.");
  console.log("   Echt leegmaken? Run:");
  console.log("   node --env-file=.env.local purge-nieuwkoop-images.mjs --delete");
  process.exit(0);
}

// 2) In batches verwijderen
let removed = 0;
for (let i = 0; i < files.length; i += 100) {
  const batch = files.slice(i, i + 100);
  const { error } = await supabase.storage.from(BUCKET).remove(batch);
  if (error) {
    console.error(`\n❌ Fout bij verwijderen batch ${i}:`, error.message);
    process.exit(1);
  }
  removed += batch.length;
  process.stdout.write(`\rVerwijderd: ${removed} / ${files.length}`);
}

console.log("\n\n" + "=".repeat(60));
console.log(`✅ ${removed} foto's verwijderd uit "${BUCKET}".`);
console.log("   Storage komt binnen ~1 uur vrij in het Supabase-dashboard.");
console.log("   Foto's worden vanzelf opnieuw gecachet bij gebruik.");
console.log("=".repeat(60));
