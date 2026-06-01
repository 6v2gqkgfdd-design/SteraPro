#!/usr/bin/env node
/**
 * Tast een reeks waarschijnlijke Nieuwkoop stock/voorraad-endpoints af
 * met je live-credentials, en toont welke 200 geeft + hoe de data eruitziet.
 * Leest NIETS, schrijft NIETS — puur verkennen.
 *
 * Gebruik:
 *   node --env-file=.env.local probe-nieuwkoop-stock.mjs
 *
 * Vereist: NIEUWKOOP_API_BASE_URL, NIEUWKOOP_API_USER, NIEUWKOOP_API_PASSWORD
 */

const BASE = process.env.NIEUWKOOP_API_BASE_URL;
const USER = process.env.NIEUWKOOP_API_USER;
const PASS = process.env.NIEUWKOOP_API_PASSWORD;
if (!BASE || !USER || !PASS) {
  console.error("❌ Ontbrekende Nieuwkoop env vars in .env.local");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

// Kandidaat-paden (Nieuwkoop gebruikt vaak ?sysmodified=). We proberen
// breed; alleen 200 met data is interessant.
const candidates = [
  "/stock",
  "/stock?sysmodified=2020-01-01",
  "/stocks",
  "/stocks?sysmodified=2020-01-01",
  "/availability",
  "/availability?sysmodified=2020-01-01",
  "/itemstock",
  "/stockitems",
  "/items/stock",
  "/stockchanges",
  "/stockchanges?sysmodified=2020-01-01",
  "/inventory",
];

async function tryOne(path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: auth, Accept: "application/json" },
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    let info = "";
    if (res.ok) {
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          info = `array, ${data.length} items. Voorbeeld: ${JSON.stringify(data[0] || {}).slice(0, 300)}`;
        } else {
          info = `object: ${JSON.stringify(data).slice(0, 300)}`;
        }
      } catch {
        info = text.slice(0, 200);
      }
    } else {
      info = text.slice(0, 150);
    }
    return `${res.ok ? "✅" : "  "} ${String(res.status).padEnd(4)} ${path}\n      ${info}`;
  } catch (e) {
    const msg = e?.name === "AbortError" ? "time-out 15s" : e?.message || "fout";
    return `   ERR  ${path}\n      ${msg}`;
  } finally {
    clearTimeout(t);
  }
}

console.log("=".repeat(64));
console.log("Nieuwkoop stock-endpoints aftasten op:", BASE);
console.log("=".repeat(64));
for (const path of candidates) {
  console.log(await tryOne(path));
}
console.log("=".repeat(64));
console.log("Tip: een ✅ 200 met een array waarin itemcode + aantal staat,");
console.log("is het voorraad-endpoint dat we zoeken.");
