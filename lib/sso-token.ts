import crypto from 'crypto'

/**
 * Kortlevend SSO-token tussen /api/sso/token (achter de Shopify App Proxy)
 * en /sso (op app.sterapro.be).
 *
 * Beide routes moeten hetzelfde geheim gebruiken. Shopify-apps zetten soms
 * alleen SHOPIFY_CLIENT_SECRET, soms ook SHOPIFY_PROXY_SECRET. Ondertekenen
 * gebeurt met de eerste die gezet is (proxy, anders client). Verifiëren
 * accepteert beide, zodat een token niet sneuvelt als de twee namen
 * verschillende waarden hebben.
 */

const TTL_MS = 60_000

export function ssoSecretCandidates(): string[] {
  const values = [process.env.SHOPIFY_PROXY_SECRET, process.env.SHOPIFY_CLIENT_SECRET]
  const out: string[] = []
  for (const value of values) {
    if (value && !out.includes(value)) out.push(value)
  }
  return out
}

export function issueSsoToken(
  email: string,
  opts?: { now?: number; ttlMs?: number; secret?: string }
): string {
  const secret = opts?.secret ?? ssoSecretCandidates()[0] ?? ''
  const now = opts?.now ?? Date.now()
  const ttl = opts?.ttlMs ?? TTL_MS
  const normalized = email.trim().toLowerCase()
  const payload = Buffer.from(
    JSON.stringify({ email: normalized, exp: now + ttl })
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifySsoToken(
  token: string,
  opts?: { now?: number; secrets?: string[] }
): string | null {
  const secrets = opts?.secrets ?? ssoSecretCandidates()
  const now = opts?.now ?? Date.now()
  const dot = token.indexOf('.')
  if (dot <= 0 || secrets.length === 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!payload || !sig) return null

  const sigBuf = Buffer.from(sig)
  let matched = false
  for (const secret of secrets) {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
    const expBuf = Buffer.from(expected)
    if (expBuf.length !== sigBuf.length) continue
    if (crypto.timingSafeEqual(expBuf, sigBuf)) {
      matched = true
      break
    }
  }
  if (!matched) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      email?: unknown
      exp?: unknown
    }
    if (typeof data.email !== 'string' || typeof data.exp !== 'number') return null
    if (!Number.isFinite(data.exp) || now > data.exp) return null
    const email = data.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
    return email
  } catch {
    return null
  }
}
