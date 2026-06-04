import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Logt de huidige gebruiker uit (wist de sessie-cookies) en stuurt door naar
 * het inlogscherm. Bereikbaar via een knop of door /logout te bezoeken.
 */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url))
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cs) =>
          cs.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  )
  await supabase.auth.signOut()
  return res
}
