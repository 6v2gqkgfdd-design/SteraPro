/**
 * Getekende demosessie voor het voorbeeldportaal.
 * Werkt in middleware (Web Crypto) en in Node-tests.
 * De cookie bewijst alleen dat deze browser het fictieve Demo Kantoor
 * mag zien. Er staat geen klantgegevens in.
 */

export const DEMO_COOKIE = 'stera_demo'
export const DEMO_STATE_COOKIE = 'stera_demo_state'
export const DEMO_COMPANY_NAME = 'Demo Kantoor'

const FALLBACK_SECRET = 'stera-preview-demo-kantoor'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export function demoEnabled(): boolean {
  const flag = (process.env.PORTAL_DEMO_MODE || '').trim().toLowerCase()
  if (flag === '0' || flag === 'off' || flag === 'false') return false
  if (flag === '1' || flag === 'on' || flag === 'true') return true
  return process.env.VERCEL_ENV !== 'production'
}

export function demoCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.VERCEL === '1',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  }
}

function secret(): string | null {
  const fromEnv = process.env.PORTAL_DEMO_SECRET?.trim()
  if (fromEnv) return fromEnv
  if (!demoEnabled()) return null
  return FALLBACK_SECRET
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function b64urlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function sign(body: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(body))
  return bytesToB64url(new Uint8Array(sig))
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function seal(payload: unknown): Promise<string | null> {
  const key = secret()
  if (!key) return null
  const body = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await sign(body, key)
  return `${body}.${sig}`
}

async function open<T>(token: string | undefined | null): Promise<T | null> {
  const key = secret()
  if (!key || !token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = await sign(body, key)
  if (!safeEqual(expected, sig)) return null
  try {
    const json = new TextDecoder().decode(b64urlToBytes(body))
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

export async function issueDemoSession(): Promise<string | null> {
  return seal({ exp: Date.now() + SESSION_TTL_MS })
}

export async function verifyDemoSession(token: string | undefined | null): Promise<boolean> {
  const payload = await open<{ exp?: number }>(token)
  return typeof payload?.exp === 'number' && payload.exp > Date.now()
}

export async function sealDemoState(state: unknown): Promise<string | null> {
  return seal(state)
}

export async function openDemoState<T>(token: string | undefined | null): Promise<T | null> {
  return open<T>(token)
}
