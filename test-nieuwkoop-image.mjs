#!/usr/bin/env node
/**
 * Test: hoe geeft Nieuwkoop de foto's terug?
 *
 * Run: node --env-file=.env.local test-nieuwkoop-image.mjs
 *
 * Probeert /items/1KEFO5T10/image (de Kentia palm die we al kennen) op te halen
 * en analyseert de response. Slaat het resultaat op als test-image-result.png
 * zodat je 'm kunt openen om te zien of de foto correct is.
 */

import { writeFileSync } from "node:fs";

const BASE = process.env.NIEUWKOOP_API_BASE_URL;
const USER = process.env.NIEUWKOOP_API_USER;
const PASS = process.env.NIEUWKOOP_API_PASSWORD;
const authHeader = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

const ITEMCODE = "1KEFO5T10"; // Kentia palm

console.log("=".repeat(60));
console.log(`Test foto endpoint voor itemcode ${ITEMCODE}`);
console.log("=".repeat(60));

const url = `${BASE}/items/${ITEMCODE}/image`;
console.log("URL:", url);

const res = await fetch(url, {
  headers: { Authorization: authHeader, Accept: "application/json, image/*, */*" },
});

console.log("\nResponse headers:");
console.log("  HTTP status:    ", res.status);
console.log("  Content-Type:   ", res.headers.get("content-type"));
console.log("  Content-Length: ", res.headers.get("content-length"));

const contentType = res.headers.get("content-type") || "";

if (contentType.includes("application/json")) {
  console.log("\n→ Response is JSON. Inspect velden:\n");
  const body = await res.json();
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string" && v.length > 80) {
      console.log(`  ${k.padEnd(20)} string (${v.length} chars) — start: "${v.slice(0, 60)}..."`);
    } else {
      console.log(`  ${k.padEnd(20)} ${typeof v}  ${JSON.stringify(v)?.slice(0,80)}`);
    }
  }

  // Probeer base64 te decoderen als er een 'Image' veld is
  if (body.Image && typeof body.Image === "string") {
    // base64 strings kunnen beginnen met "data:image/png;base64," prefix of niet
    const raw = body.Image.replace(/^data:image\/\w+;base64,/, "");
    try {
      const buf = Buffer.from(raw, "base64");
      writeFileSync("test-image-result.png", buf);
      console.log(`\n✅ Foto gedecodeerd uit base64 (${buf.length} bytes) → opgeslagen als test-image-result.png`);
      console.log("   Open dit bestand om te checken of de foto klopt.");
    } catch (e) {
      console.log("\n❌ Kon Image-veld niet decoderen als base64:", e.message);
    }
  }
} else if (contentType.startsWith("image/")) {
  console.log("\n→ Response is RAW image data.");
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync("test-image-result.png", buf);
  console.log(`✅ Foto opgeslagen (${buf.length} bytes) als test-image-result.png`);
} else {
  console.log("\n? Onbekend content-type, body (eerste 500 chars):");
  const text = await res.text();
  console.log(text.slice(0, 500));
}

console.log("\nKlaar.\n");
