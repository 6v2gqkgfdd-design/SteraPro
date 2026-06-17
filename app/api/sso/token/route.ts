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
function verifyProxySignature(params: URLSearchParams): boolean {
  const sig = params.get('signature')
  if (!sig || !SECRET) return false
  const keys = [...new Set([...params.keys()])].filter((k) => k !== 'signature').sort()
  const message = keys.map((k) => `${k}=${params.getAll(k).join(',')}`).join('')
  const digest = crypto.createHmac('sha256', SECRET).update(message).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig))
  } catch {
    return false
  }
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
    // TIJDELIJKE DIAGNOSTIEK — alleen actief met ?__debug=1. Lekt geen secrets:
    // enkel booleans, lengtes en hash-prefixes. Verwijderen zodra opgelost.
    if (params.get('__debug') === '1') {
      const sig = params.get('signature') || ''
      const keys = [...new Set([...params.keys()])].filter((k) => k !== 'signature').sort()
      const message = keys.map((k) => `${k}=${params.getAll(k).join(',')}`).join('')
      const computed = SECRET
        ? crypto.createHmac('sha256', SECRET).update(message).digest('hex')
        : ''
      return NextResponse.json({
        ok: false,
        error: 'bad_signature',
        _debug: {
          hasProxySecret: !!process.env.SHOPIFY_PROXY_SECRET,
          hasClientSecret: !!process.env.SHOPIFY_CLIENT_SECRET,
          secretLen: SECRET.length,
          signedKeys: keys,
          receivedSigPrefix: sig.slice(0, 12),
          computedSigPrefix: computed.slice(0, 12),
          matches: computed !== '' && computed === sig,
        },
      })
    }
    return NextResponse.json({ ok: false, error: 'bad_signature' }, { status: 401 })
  }
  const cid = params.get('logged_in_customer_id')
  if (!cid) return NextResponse.json({ ok: true, loggedIn: false })
  const email = await fetchCustomerEmail(cid)
  if (!email) return NextResponse.json({ ok: true, loggedIn: false })
  return NextResponse.json({ ok: true, loggedIn: true, token: issueToken(email) })
}
