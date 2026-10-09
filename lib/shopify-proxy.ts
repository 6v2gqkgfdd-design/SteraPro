import crypto from 'crypto'

/** Zelfde App Proxy-handtekening als /api/sso/token. */
export function proxySecretCandidates(): string[] {
  return [process.env.SHOPIFY_PROXY_SECRET, process.env.SHOPIFY_CLIENT_SECRET].filter(
    (s): s is string => !!s
  )
}

export function buildProxyMessage(params: URLSearchParams, extra?: Record<string, string>): string {
  const merged = new URLSearchParams(params)
  if (extra) for (const [k, v] of Object.entries(extra)) if (!merged.has(k)) merged.set(k, v)
  const keys = [...new Set([...merged.keys()])].filter((k) => k !== 'signature').sort()
  return keys.map((k) => `${k}=${merged.getAll(k).join(',')}`).join('')
}

export function verifyProxySignature(params: URLSearchParams): boolean {
  const sig = params.get('signature')
  if (!sig) return false
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
        // lengte-mismatch
      }
    }
  }
  return false
}
