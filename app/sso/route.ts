import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient as createServer } from '@/lib/supabase/server'
import { verifySsoToken } from '@/lib/sso-token'

/**
 * SSO stap 2 — draait op app.sterapro.be, geladen met ?token=.
 *
 * Verifieert het kortlevende token uit /api/sso/token met dezelfde
 * secret-fallback (SHOPIFY_PROXY_SECRET, anders SHOPIFY_CLIENT_SECRET;
 * verifiëren accepteert beide). Een sessie wordt alleen aangemaakt als
 * er een goedgekeurde portal_contacts-rij voor dat e-mailadres is.
 * Zonder rij → registreren. Met een nog niet goedgekeurde rij → login,
 * zonder Supabase-gebruiker aan te maken.
 */

export const runtime = 'nodejs'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

type ContactRow = {
  email: string | null
  status: string | null
  company_id: string | null
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const fail = NextResponse.redirect(new URL('/portal/login', req.url))
  if (!token) return fail
  const email = verifySsoToken(token)
  if (!email) return fail

  const admin = createAdmin(SUPA_URL, SUPA_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: contacts } = await admin
    .from('portal_contacts')
    .select('email, status, company_id')
    .ilike('email', email)
    .limit(20)

  const exact = ((contacts ?? []) as ContactRow[]).filter(
    (row) => (row.email || '').trim().toLowerCase() === email
  )
  const approved = exact.find((row) => row.status === 'approved' && row.company_id)

  const params = new URLSearchParams({ email })
  if (exact.length === 0) {
    return NextResponse.redirect(new URL(`/portal/registreren?${params}`, req.url))
  }
  if (!approved) {
    params.set('notice', 'pending')
    return NextResponse.redirect(new URL(`/portal/login?${params}`, req.url))
  }

  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {})

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
