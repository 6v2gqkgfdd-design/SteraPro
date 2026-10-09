import { NextResponse } from 'next/server'
import { DEMO_COOKIE, demoCookieOptions, demoEnabled, issueDemoSession } from '@/lib/demo-session'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!demoEnabled()) {
    return NextResponse.redirect(new URL('/portal/login', request.url))
  }
  const token = await issueDemoSession()
  const res = NextResponse.redirect(new URL('/portal/dashboard', request.url))
  if (token) res.cookies.set(DEMO_COOKIE, token, demoCookieOptions())
  return res
}
