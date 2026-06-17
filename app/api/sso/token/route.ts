import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * SSO stap 1 — draait ACHTER de Shopify App Proxy.
 *
 * Shopify roept deze route aan (via sterapro.be/apps/mijn) en plakt er
 * ondertekend bij wie er ingelogd is (logged_in_customer_id + signature).
 * We verifiëren die handtekening met het app-secret, halen het e-mailadres
 * van de klant op via de Admin API, en geven een KORTLEVEND, door onszelf
 * ondertekend token terug. Dat token wordt daarna door de iframe-pagina
 * (app.sterapro.be/sso?token=...) verzilverd tot een echte Supabase-sessie.
 */

export const runtime = 'nodejs'

// De Shopify App Proxy ondertekent met het app-client-secret. Deze code las
// eerder SHOPIFY_PROXY_SECRET / SHOPIFY_PROXY_CLIENT_ID, maar die bestaan niet:
// in .env.local (en op Vercel) heten ze SHOPIFY_CLIENT_SECRET / SHOPIFY_CLIENT_ID.
// Daardoor was SECRET leeg en faalde élke handtekening met "bad_signature".
// We accepteren nu beide namen, zodat het werkt ongeacht de omgeving.
const SECRET = process.env.SHOPIFY_PROXY_SECRET || process.env.SHOPIFY_CLIENT_SECRET || ''
const SHOP = process.env.SHOPIFY_STORE_DOMAIN
const CLIENT_ID = process.env.SHOPIFY_PROXY_CLIENT_ID || process.env.SHOPIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SHOPIFY_PROXY_SECRET || process.env.SHOPIFY_CLIENT_SECRET
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04'

// Shopify App Proxy-handtekening: alle query-params behalve "signature",
// alfabetisch gesorteerd, als key=value (arrays met komma's), zonder
// scheidingsteken aan elkaar, HMAC-SHA256 met het app-secret (hex).
// Kandidaat-secrets: zowel SHOPIFY_PROXY_SECRET als SHOPIFY_CLIENT_SECRET kunnen
// gezet zijn (met mogelijk verschillende waarden). We accepteren de handtekening
// als één van beide klopt, zodat we niet afhangen van de juiste env-naam.
function proxySecretCandidates(): string[] {
  return [process.env.SHOPIFY_PROXY_SECRET, process.env.SHOPIFY_CLIENT_SECRET].filter(
    (s): s is string => !!s
  )
}

// Bouwt het te ondertekenen bericht: alle params behalve "signature",
// alfabetisch gesorteerd, als key=value zonder scheidingsteken (arrays met
// komma's). Met `extra` kun je ontbrekende params toevoegen (zie hieronder).
function buildProxyMessage(params: URLSearchParams, extra?: Record<string, string>): string {
  const merged = new URLSearchParams(params)
  if (extra) for (const [k, v] of Object.entries(extra)) if (!merged.has(k)) merged.set(k, v)
  const keys = [...new Set([...merged.keys()])].filter((k) => k !== 'signature').sort()
  return keys.map((k) => `${k}=${merged.getAll(k).join(',')}`).join('')
}

function verifyProxySignature(params: URLSearchParams): boolean {
  const sig = params.get('signature')
  if (!sig) return false
  // Shopify ondertekent álle proxy-params, inclusief een LEEG
  // logged_in_customer_id wanneer niemand is ingelogd. Onze trailing-slash
  // rewrite kan zo'n lege param laten vallen, waardoor het bericht niet meer
  // overeenkomt. Daarom verifiëren we ook de variant mét logged_in_customer_id=.
  const messages = [buildProxyMessage(params)]
  if (!params.has('logged_in_customer_id')) {
    messages.push(buildProxyMessage(params, { logged_in_customer_id: '' }))
  }
  for (const secret of proxySecretCandidates()) {
    for (const message of messages) {
      const digest = crypto.createHmac('sha256', secret).update(message).digest('hex')
      try {
        if (digest.length === sig.length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig))) {
          return true
        }
      } catch {
        // lengte-mismatch e.d. — probeer volgende
      }
    }
  }
  return false
}

async function fetchCustomerEmail(customerId: string): Promise<string | null> {
  if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) return null
  const tokRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  const tok = await tokRes.json().catch(() => ({}))
  if (!tok.access_token) return null
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': tok.access_token,
    },
    body: JSON.stringify({
      query: 'query($id: ID!){ customer(id: $id){ email } }',
      variables: { id: `gid://shopify/Customer/${customerId}` },
    }),
  })
  const j = await res.json().catch(() => ({}))
  return j?.data?.customer?.email || null
}

// Eigen, kortlevend token (60s): base64url(payload).hmac
function issueToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email, exp: Date.now() + 60_000 })
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  if (!verifyProxySignature(params)) {
    return NextResponse.json({ ok: false, error: 'bad_signature' }, { status: 401 })
  }
  const cid = params.get('logged_in_customer_id')
  if (!cid) return NextResponse.json({ ok: true, loggedIn: false })
  const email = await fetchCustomerEmail(cid)
  if (!email) return NextResponse.json({ ok: true, loggedIn: false })
  return NextResponse.json({ ok: true, loggedIn: true, token: issueToken(email) })
}
