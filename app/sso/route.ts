import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient as createServer } from '@/lib/supabase/server'

/**
 * SSO stap 2 — draait op app.sterapro.be, geladen in de iframe met ?token=.
 *
 * Verifieert het kortlevende token uit /api/sso/token, zorgt dat er een
 * Supabase-gebruiker voor dat e-mailadres bestaat, mint serverzijdig een
 * sessie (magic-link token → verifyOtp → sessie-cookie op app.sterapro.be)
 * en stuurt door naar het portaal. Geen wachtwoord/mail nodig.
 */

export const runtime = 'nodejs'

const SECRET = process.env.SHOPIFY_PROXY_SECRET || ''
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

function verifyToken(token: string): string | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig || !SECRET) return null
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!data.email || !data.exp || Date.now() > data.exp) return null
    return data.email as string
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const fail = NextResponse.redirect(new URL('/portal/login', req.url))
  if (!token) return fail
  const email = verifyToken(token)
  if (!email) return fail

  const admin = createAdmin(SUPA_URL, SUPA_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Zorg dat de gebruiker bestaat (negeer "already registered").
  await admin.auth.admin
    .createUser({ email, email_confirm: true })
    .catch(() => {})

  // Magic-link token genereren en serverzijdig verzilveren → sessie-cookie.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkErr || !tokenHash) return fail

  const supabase = await createServer()
  const { error: vErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })
  if (vErr) return fail

  return NextResponse.redirect(new URL('/portal/dashboard', req.url))
}
