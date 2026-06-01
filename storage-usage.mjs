#!/usr/bin/env node
/**
 * Lijst alle Supabase Storage buckets op met hun aantal bestanden en
 * totale grootte. Handig om te zien waar je storage-quota in zit.
 *
 * Gebruik:
 *   node --env-file=.env.local storage-usage.mjs
 *
 * Vereist: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ Ontbrekende env vars: NEXT_PUBLIC_SUPABASE_URL en/of SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

// Recursief alle objecten in een bucket overlopen (ook submappen)
async function walk(bucket, prefix = "") {
  let count = 0;
  let bytes = 0;
  const limit = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) {
      console.error(`   ⚠️  fout bij list (${bucket}/${prefix}): ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    for (const entry of data) {
      if (entry.id === null) {
        // map → recursief
        const sub = await walk(bucket, prefix ? `${prefix}/${entry.name}` : entry.name);
        count += sub.count;
        bytes += sub.bytes;
      } else {
        count += 1;
        bytes += entry.metadata?.size || 0;
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return { count, bytes };
}

const { data: buckets, error } = await supabase.storage.listBuckets();
if (error) {
  console.error("❌ Kon buckets niet ophalen:", error.message);
  process.exit(1);
}

console.log("=".repeat(60));
console.log("Supabase Storage — overzicht per bucket");
console.log("=".repeat(60));

let totalBytes = 0;
for (const b of buckets) {
  process.stdout.write(`Bucket "${b.name}" doorzoeken...`);
  const { count, bytes } = await walk(b.name);
  totalBytes += bytes;
  console.log(`\r  ${b.name.padEnd(28)} ${String(count).padStart(7)} bestanden   ${mb(bytes).padStart(12)}`);
}

console.log("-".repeat(60));
console.log(`  ${"TOTAAL".padEnd(28)} ${"".padStart(7)}             ${mb(totalBytes).padStart(12)}`);
console.log("=".repeat(60));
if (buckets.length === 0) console.log("(geen buckets gevonden)");
