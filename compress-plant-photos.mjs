#!/usr/bin/env node
/**
 * Verkleint de bestaande foto's in de Supabase Storage bucket
 * "plant-photos" zodat je onder de gratis 1 GB-limiet komt.
 *
 * Veilig opgezet:
 *   - DRY-RUN (default): downloadt + verkleint in het geheugen en toont
 *     hoeveel je zou besparen. Uploadt NIETS, wijzigt NIETS.
 *   - --apply: maakt eerst een LOKALE BACKUP van elke originele foto,
 *     en vervangt daarna de foto in de bucket (zelfde pad → links blijven
 *     werken).
 *
 * Foto's worden verkleind tot max 1600px (langste zijde) en opnieuw
 * gecomprimeerd. Bestandsformaat blijft gelijk (jpeg/png/webp), zodat
 * bestaande URL's intact blijven.
 *
 * Gebruik:
 *   node --env-file=.env.local compress-plant-photos.mjs            # preview
 *   node --env-file=.env.local compress-plant-photos.mjs --apply    # echt verkleinen
 *   ... --backup=/pad/naar/backup   (default: ./plant-photos-backup)
 *
 * Vereist: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, sharp
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BUCKET = "plant-photos";
const MAX_DIM = 1600; // zelfde als de app (lib/image.ts en fileToJpeg)
const QUALITY = 82;
const SKIP_BELOW_BYTES = 400 * 1024; // foto's < 400KB die al klein genoeg zijn overslaan

const apply = process.argv.includes("--apply");
const backupArg = process.argv.find((a) => a.startsWith("--backup="));
const BACKUP_DIR = backupArg ? backupArg.split("=")[1] : "./plant-photos-backup";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ Ontbrekende env vars: NEXT_PUBLIC_SUPABASE_URL en/of SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";

// Recursief alle bestandspaden in de bucket verzamelen
async function listAll(prefix = "") {
  const out = [];
  const limit = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) { console.error("❌ list fout:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...(await listAll(path)));
      else out.push(path);
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

console.log("=".repeat(64));
console.log(`Foto's verkleinen in bucket "${BUCKET}"`);
console.log("Modus:", apply ? "APPLY (backup + vervangen)" : "DRY-RUN (alleen preview)");
if (apply) console.log("Backup-map:", BACKUP_DIR);
console.log(`Instellingen: max ${MAX_DIM}px, kwaliteit ${QUALITY}`);
console.log("=".repeat(64));

const paths = await listAll();
console.log(`\n${paths.length} bestanden gevonden.\n`);

let origTotal = 0, newTotal = 0, changed = 0, skipped = 0, failed = 0, done = 0;

for (const path of paths) {
  done++;
  process.stdout.write(`\r[${done}/${paths.length}] verwerken...`);

  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
  if (dlErr || !blob) { failed++; console.log(`\n  ⚠️  download mislukt: ${path} (${dlErr?.message || "?"})`); continue; }
  const input = Buffer.from(await blob.arrayBuffer());
  origTotal += input.length;

  let meta;
  try { meta = await sharp(input).metadata(); }
  catch { failed++; newTotal += input.length; console.log(`\n  ⚠️  geen geldige afbeelding: ${path}`); continue; }

  const fmt = meta.format;
  const big = (meta.width || 0) > MAX_DIM || (meta.height || 0) > MAX_DIM;
  if (!["jpeg", "png", "webp"].includes(fmt) || (!big && input.length < SKIP_BELOW_BYTES)) {
    skipped++; newTotal += input.length; continue; // formaat onbekend, of al klein genoeg
  }

  let output, contentType;
  try {
    let p = sharp(input).rotate().resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true });
    if (fmt === "png") { output = await p.png({ compressionLevel: 9 }).toBuffer(); contentType = "image/png"; }
    else if (fmt === "webp") { output = await p.webp({ quality: QUALITY }).toBuffer(); contentType = "image/webp"; }
    else { output = await p.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer(); contentType = "image/jpeg"; }
  } catch (e) { failed++; newTotal += input.length; console.log(`\n  ⚠️  verkleinen mislukt: ${path} (${e.message})`); continue; }

  // Geen winst? origineel houden.
  if (output.length >= input.length) { skipped++; newTotal += input.length; continue; }

  newTotal += output.length;
  changed++;

  if (apply) {
    // 1) backup origineel lokaal
    const backupPath = join(BACKUP_DIR, path);
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(backupPath, input);
    // 2) vervang in bucket (zelfde pad)
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, output, { upsert: true, contentType, cacheControl: "31536000" });
    if (upErr) { failed++; console.log(`\n  ⚠️  upload mislukt: ${path} (${upErr.message})`); }
  }
}

console.log("\n\n" + "=".repeat(64));
console.log(`Bestanden:        ${paths.length}  (verkleind: ${changed}, overgeslagen: ${skipped}, mislukt: ${failed})`);
console.log(`Totaal nu:        ${mb(origTotal)}`);
console.log(`Totaal na:        ${mb(newTotal)}`);
const saved = origTotal - newTotal;
console.log(`Besparing:        ${mb(saved)}  (${origTotal ? ((saved / origTotal) * 100).toFixed(0) : 0}%)`);
console.log("=".repeat(64));
if (!apply) {
  console.log("\nℹ️  Dit was een DRY-RUN — er is niets gewijzigd.");
  console.log("   Tevreden met de besparing? Run dan met backup:");
  console.log("   node --env-file=.env.local compress-plant-photos.mjs --apply");
} else {
  console.log(`\n✅ Klaar. Originelen staan veilig in: ${BACKUP_DIR}`);
  console.log("   Storage in het dashboard ververst binnen ~1 uur.");
}
