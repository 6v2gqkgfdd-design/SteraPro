#!/usr/bin/env node
/**
 * Test script v3 voor Nieuwkoop Customer API (DEV)
 *
 * Run: node --env-file=.env.local test-nieuwkoop-api.mjs
 *
 * Doel: ontdekken welke parameters /items, /stock, /prices vereisen
 * en daarna een correcte sample call doen.
 */

const BASE = process.env.NIEUWKOOP_API_BASE_URL;
const USER = process.env.NIEUWKOOP_API_USER;
const PASS = process.env.NIEUWKOOP_API_PASSWORD;
const authHeader = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

async function call(method, path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, raw: text };
}

console.log("=".repeat(60));
console.log("Nieuwkoop API DEV test v3 — parameter discovery");
console.log("=".repeat(60));

// STAP 1: Swagger spec ophalen
console.log("\n[1] Swagger spec ophalen...");
const specRes = await call("GET", "/swagger/docs/v1");
if (specRes.status !== 200) {
  console.error("Kon swagger niet ophalen, HTTP", specRes.status);
  process.exit(1);
}
const spec = specRes.body;
console.log(`    ✅ OK — ${Object.keys(spec.paths).length} endpoints, ${Object.keys(spec.definitions || {}).length} definities`);

// STAP 2: Print parameters voor de endpoints die we willen
console.log("\n[2] Parameter-info voor /items, /stock, /prices, /tags:\n");
const interesting = ["/items", "/stock", "/prices", "/tags", "/salesorders"];
for (const path of interesting) {
  const def = spec.paths[path];
  if (!def || !def.get) continue;
  const params = def.get.parameters || [];
  console.log(`  ${path}`);
  console.log(`    Summary: ${def.get.summary || "(geen)"}`);
  if (params.length === 0) {
    console.log(`    Parameters: geen`);
  } else {
    for (const p of params) {
      const req = p.required ? "REQUIRED" : "optional";
      console.log(`    - ${p.name.padEnd(20)} [${p.in}] ${p.type || p.schema?.type || ""} (${req})${p.description ? "  // " + p.description : ""}`);
    }
  }
  // print ook response schema referentie
  const resp200 = def.get.responses?.["200"];
  if (resp200) {
    const schemaRef = resp200.schema?.$ref || resp200.schema?.items?.$ref;
    console.log(`    Response schema: ${schemaRef || JSON.stringify(resp200.schema)}`);
  }
  console.log("");
}

// STAP 3: Probeer /items met sysmodified parameter
console.log("=".repeat(60));
console.log("[3] /items proberen met verschillende sysmodified-formats");
console.log("=".repeat(60));

const sysmodVariants = [
  "/items?sysmodified=-1",
  "/items?sysmodified=2020-01-01",
  "/items?sysmodified=2020-01-01T00:00:00Z",
  "/items?Sysmodified=-1",
  "/items?modified=-1",
];

for (const v of sysmodVariants) {
  process.stdout.write(`  TRY ${v.padEnd(50)} `);
  const r = await call("GET", v);
  console.log(`HTTP ${r.status}` + (Array.isArray(r.body) ? ` (${r.body.length} items)` : ""));
  if (r.status === 200 && Array.isArray(r.body) && r.body.length > 0) {
    console.log(`    ✅ Werkt! Sample 1e item:`);
    const sample = r.body[0];
    console.log(JSON.stringify(sample, null, 2).split("\n").map(l => "    " + l).join("\n"));
    break;
  } else if (r.status >= 400 && r.status < 500) {
    console.log(`    Body (eerste 200 chars): ${typeof r.body === "string" ? r.body.slice(0,200) : JSON.stringify(r.body).slice(0,200)}`);
  }
}

// STAP 4: Dump definities die we waarschijnlijk gaan gebruiken (Item, Stock, Price)
console.log("\n" + "=".repeat(60));
console.log("[4] Schema definities (uit Swagger spec)");
console.log("=".repeat(60));

const interestingDefs = Object.keys(spec.definitions || {}).filter(k =>
  /item|stock|price|tag|salesorder/i.test(k)
);
for (const defName of interestingDefs.slice(0, 6)) {
  const def = spec.definitions[defName];
  console.log(`\n  ${defName}:`);
  if (def.properties) {
    for (const [propName, propDef] of Object.entries(def.properties)) {
      const type = propDef.type || (propDef.$ref ? "ref→" + propDef.$ref.split("/").pop() : (propDef.items ? "array" : "?"));
      console.log(`    ${propName.padEnd(28)} ${type}${propDef.description ? "  // " + propDef.description : ""}`);
    }
  }
}

console.log("\n✅ Klaar. Plak de output terug in chat.\n");
