import { NextResponse } from 'next/server'
import { DEMO_COOKIE, DEMO_STATE_COOKIE } from '@/lib/demo-session'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL('/portal/login', request.url))
  res.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 })
  res.cookies.set(DEMO_STATE_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
