#!/usr/bin/env node
/**
 * Verkent de Nieuwkoop-catalogus om de filter voor "combinaties voor
 * buiten" exact te bepalen. Schrijft NIETS weg — enkel lezen + tellen.
 *
 * Wat het toont:
 *   - hoeveel items er per definitie "combinatie" zijn
 *   - welke SubstrateType / SubstratesVariety-waarden bij combinaties voorkomen
 *   - hoeveel combinaties Binnen / Buiten zijn
 *   - kruistabel substraat x binnen/buiten
 *
 * Gebruik:
 *   node --env-file=.env.local explore-nieuwkoop-combos.mjs
 */

const NK_BASE = process.env.NIEUWKOOP_API_BASE_URL;
const NK_USER = process.env.NIEUWKOOP_API_USER;
const NK_PASS = process.env.NIEUWKOOP_API_PASSWORD;
if (!NK_BASE || !NK_USER || !NK_PASS) {
  console.error("❌ Ontbrekende Nieuwkoop env vars in .env.local");
  process.exit(1);
}
const authHeader = "Basic " + Buffer.from(`${NK_USER}:${NK_PASS}`).toString("base64");

// --- ophalen met ruime time-out + 1 retry ---
const FETCH_TIMEOUT_MS = 180_000;
async function fetchItems(attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${NK_BASE}/items?sysmodified=2000-01-01`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`❌ Nieuwkoop API gaf HTTP ${res.status}`);
      process.exit(1);
    }
    return await res.json();
  } catch (e) {
    const reason = e?.name === "AbortError" ? `time-out na ${FETCH_TIMEOUT_MS / 1000}s` : (e?.message || "netwerkfout");
    if (attempt < 2) {
      console.warn(`⚠️  Ophalen mislukt (${reason}). Nog één poging...`);
      return fetchItems(attempt + 1);
    }
    console.error(`❌ Ophalen definitief mislukt: ${reason}`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

// Haalt de waarden (NL) op van een tag met gegeven code.
function tagValues(item, code) {
  const tag = (item.Tags || []).find((t) => t?.Code === code);
  if (!tag) return [];
  return (tag.Values || []).map((v) => v?.Description_NL).filter(Boolean);
}

function tally(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}
function printTally(title, map) {
  console.log(`\n${title}`);
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) { console.log("   (geen)"); return; }
  for (const [k, v] of sorted) console.log(`   ${String(v).padStart(6)}  ${k}`);
}

console.log("Items ophalen van", NK_BASE, "...");
const items = await fetchItems();
console.log(`✅ ${items.length} items opgehaald\n` + "=".repeat(60));

// Combinatie-definities naast elkaar zodat we zien wat klopt
const byGroupName = items.filter((it) => (it.GroupDescription_NL || "").trim() === "Combinaties");
const byGroupCode = items.filter((it) => String(it.ProductGroupCode) === "275");
console.log(`Combinaties volgens GroupDescription_NL == "Combinaties": ${byGroupName.length}`);
console.log(`Combinaties volgens ProductGroupCode == "275":            ${byGroupCode.length}`);

// We gebruiken de groepsnaam-definitie voor de rest
const combos = byGroupName;

// Substraat-waarden bij combinaties
const substrateType = new Map();
const substratesVariety = new Map();
const location = new Map();
let comboWithoutSubstrate = 0;

for (const it of combos) {
  const st = tagValues(it, "SubstrateType");
  const sv = tagValues(it, "SubstratesVariety");
  const loc = tagValues(it, "Location");
  if (st.length === 0 && sv.length === 0) comboWithoutSubstrate++;
  for (const v of st) tally(substrateType, v);
  for (const v of sv) tally(substratesVariety, v);
  for (const v of (loc.length ? loc : ["(geen Location-tag)"])) tally(location, v);
}

printTally('SubstrateType-waarden bij combinaties:', substrateType);
printTally('SubstratesVariety-waarden bij combinaties:', substratesVariety);
printTally('Location-waarden bij combinaties:', location);
console.log(`\nCombinaties zonder enige substraat-tag: ${comboWithoutSubstrate}`);

// Kruistabel: substraat (SubstrateType) x binnen/buiten
console.log("\nKruistabel SubstrateType x Location (aantal combinaties):");
const cross = new Map();
for (const it of combos) {
  const sts = tagValues(it, "SubstrateType");
  const locs = tagValues(it, "Location");
  const stKey = sts.length ? sts.join("+") : "(geen)";
  const isBuiten = locs.includes("Buiten");
  const isBinnen = locs.includes("Binnen");
  const locKey = isBuiten && isBinnen ? "Binnen+Buiten" : isBuiten ? "Buiten" : isBinnen ? "Binnen" : "(geen)";
  const key = `${stKey}  |  ${locKey}`;
  tally(cross, key);
}
printTally("   substraat | locatie", cross);

// Hoeveel combinaties zijn "voor buiten" (Location bevat Buiten)?
const buiten = combos.filter((it) => tagValues(it, "Location").includes("Buiten"));
console.log(`\n➡️  Combinaties met Location 'Buiten' (incl. binnen+buiten): ${buiten.length}`);
console.log("=".repeat(60));
