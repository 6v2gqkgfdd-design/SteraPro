/**
 * Stera Pro — Nieuwkoop product image proxy & cache (v2)
 *
 * Plaats: app/api/nieuwkoop/image/[itemcode]/route.ts
 *
 * Verbeteringen t.o.v. v1:
 *  - Concurrent request deduplication (1 fetch per itemcode tegelijk per process)
 *  - 1 retry op Nieuwkoop 5xx / netwerkfout
 *  - Bij definitieve fout een placeholder SVG (200) i.p.v. broken image icon
 *
 * Flow:
 *  1. HEAD-check op Supabase Storage public URL — zo ja: 302 redirect
 *  2. Anders: fetch van Nieuwkoop → base64 decoderen → upload naar Storage → 302 redirect
 *  3. Bij fout: 200 met placeholder SVG (no-cache, zodat browser retry'ed bij refresh)
 *
 * Vereiste env vars:
 *   NIEUWKOOP_API_BASE_URL, NIEUWKOOP_API_USER, NIEUWKOOP_API_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import sharp from "sharp";

const BUCKET = "nieuwkoop-images";
const NK_BASE = process.env.NIEUWKOOP_API_BASE_URL!;
const NK_USER = process.env.NIEUWKOOP_API_USER!;
const NK_PASS = process.env.NIEUWKOOP_API_PASSWORD!;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ITEMCODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// In-memory inflight dedup. Wordt gereset bij elke serverless cold start, dat is OK.
const inflight = new Map<string, Promise<string | null>>();

function nkAuthHeader() {
  return "Basic " + Buffer.from(`${NK_USER}:${NK_PASS}`).toString("base64");
}

function placeholderResponse(reason: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="100%" height="100%" fill="#F2EDE0"/>
  <g fill="#9B9685" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
    <text x="200" y="200" font-size="48">🌿</text>
    <text x="200" y="240" font-size="14">geen foto beschikbaar</text>
  </g>
</svg>`;
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // belangrijk: NIET lang cachen, anders zit de placeholder vast
      "Cache-Control": "no-cache, must-revalidate",
      "X-Placeholder-Reason": reason,
    },
  });
}

async function fetchFromNieuwkoop(itemcode: string, attempt = 0): Promise<Buffer | "404" | "error"> {
  try {
    const res = await fetch(`${NK_BASE}/items/${itemcode}/image`, {
      headers: { Authorization: nkAuthHeader(), Accept: "application/json" },
    });
    if (res.status === 404) return "404";
    if (!res.ok) {
      // 1x retry op 5xx of rate-limit
      if (attempt === 0 && (res.status >= 500 || res.status === 429)) {
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
        return fetchFromNieuwkoop(itemcode, 1);
      }
      console.error(`[nieuwkoop image] ${itemcode}: HTTP ${res.status}`);
      return "error";
    }
    const body = await res.json();
    if (!body?.Image || typeof body.Image !== "string") {
      console.error(`[nieuwkoop image] ${itemcode}: no Image field`);
      return "error";
    }
    const cleaned = body.Image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleaned, "base64");
    if (buffer.length < 100) {
      console.error(`[nieuwkoop image] ${itemcode}: decoded too small`);
      return "error";
    }
    return buffer;
  } catch (err: any) {
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
      return fetchFromNieuwkoop(itemcode, 1);
    }
    console.error(`[nieuwkoop image] ${itemcode}: fetch error`, err?.message);
    return "error";
  }
}

/**
 * Haal foto op, upload naar Storage, return public URL.
 * Returnt null bij definitieve fout. Wordt gededupliceerd via inflight Map.
 */
async function ensureImageCached(itemcode: string, supabase: any, publicUrl: string): Promise<string | null> {
  if (inflight.has(itemcode)) {
    return inflight.get(itemcode)!;
  }
  const promise = (async () => {
    const result = await fetchFromNieuwkoop(itemcode);
    if (result === "404" || result === "error") return null;
    // Verklein vóór cachen (max 800px JPEG) — anders loopt de Storage vol
    // met foto's op volle resolutie. Valt terug op de originele buffer als
    // verkleinen onverwacht faalt.
    let toStore: Buffer = result;
    try {
      toStore = await sharp(result)
        .rotate()
        .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
        // Transparante PNG → JPEG zou zwart worden; vul de achtergrond met
        // de cream-kleur van de app (#FFFDF7) zodat foto's mooi inpassen.
        .flatten({ background: { r: 255, g: 253, b: 247 } })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
    } catch (e: any) {
      console.error(`[nieuwkoop image] ${itemcode}: resize fout`, e?.message);
    }
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${itemcode}.jpg`, toStore, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      });
    if (error) {
      console.error(`[nieuwkoop image] ${itemcode}: upload error`, error.message);
      return null;
    }
    return publicUrl;
  })();
  inflight.set(itemcode, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(itemcode);
  }
}

export async function GET(_request: Request, context: any) {
  const params = await Promise.resolve(context?.params);
  const itemcode: string | undefined = params?.itemcode;

  if (!itemcode || !ITEMCODE_PATTERN.test(itemcode)) {
    return NextResponse.json({ error: "Invalid itemcode" }, { status: 400 });
  }
  if (!NK_BASE || !NK_USER || !NK_PASS || !SUPA_URL || !SUPA_SERVICE_KEY) {
    return placeholderResponse("env-missing");
  }

  const supabase = createClient(SUPA_URL, SUPA_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const fileName = `${itemcode}.jpg`;
  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  const publicUrl = publicUrlData.publicUrl;

  // Stap 1: zit de foto al in Storage?
  try {
    const headRes = await fetch(publicUrl, { method: "HEAD" });
    if (headRes.ok) {
      return NextResponse.redirect(publicUrl, 302);
    }
  } catch {
    // ga door naar fetch+upload
  }

  // Stap 2: cachen (met dedup)
  const cachedUrl = await ensureImageCached(itemcode, supabase, publicUrl);
  if (!cachedUrl) {
    return placeholderResponse("nieuwkoop-fetch-failed");
  }

  return NextResponse.redirect(cachedUrl, 302);
}
