import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Scheidt twee werelden:
 *  - Klantenportaal (/portal/*): vereist een ingelogde gebruiker.
 *  - Beheer (al de rest): vereist login, en houdt portaal-klanten buiten.
 *
 * Publiek (geen login): /login, /portal/login, /q/*, /sign/*, /api/*.
 * De "is deze gebruiker een klant?"-check gebeurt via de SECURITY DEFINER
 * RPC my_portal_company (geeft enkel de eigen rij terug).
 */

function isPublic(path: string): boolean {
  if (path === '/login' || path === '/portal/login' || path === '/logout') return true
  if (path === '/sso') return true
  if (path === '/portal/registreren') return true
  // Plantconfigurator: publiek bereikbaar vanaf de webshop, zonder login.
  if (path === '/configurator' || path.startsWith('/configurator/')) return true
  return (
    path.startsWith('/q/') ||
    path.startsWith('/sign/') ||
    path.startsWith('/api/')
  )
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const path = req.nextUrl.pathname

  // Shopify App Proxy stuurt /apps/mijn door naar deze route MÉT trailing slash
  // (/api/sso/token/). Met `skipTrailingSlashRedirect` (next.config.ts) doet
  // Next.js daar geen 308-redirect meer op — die lekte via de proxy naar
  // sterapro.be/api/sso/token en gaf een 404. We rewriten de slash-versie hier
  // intern (géén redirect, query blijft behouden) naar de canonieke route, zodat
  // de handler 200 JSON teruggeeft die de proxy aan de browser doorgeeft.
  if (path === '/api/sso/token/') {
    const url = req.nextUrl.clone()
    url.pathname = '/api/sso/token'
    return NextResponse.rewrite(url)
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cs) =>
          cs.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          ),
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const inPortal = path === '/portal' || path.startsWith('/portal/')
  // Login én de auth-callback (waar de sessie pas wordt gezet) hebben nog
  // geen sessie nodig.
  const isPortalAuth =
    path === '/portal/login' ||
    path.startsWith('/portal/auth') ||
    path === '/portal/registreren'

  // Tijdelijk: de portaal-preview (mockup-stijl, voorbeelddata) is publiek
  // bekijkbaar zodat de toggle en het ontwerp zonder login te zien zijn.
  // Wordt opnieuw afgeschermd zodra de echte klantdata + Shopify-login
  // gekoppeld zijn.
  const isPortalPreview =
    path === '/portal/dashboard' ||
    path === '/portal/onderhoud' ||
    path === '/portal/planten' ||
    path === '/portal/leveringen' ||
    path === '/portal/contract' ||
    path === '/portal/offertes' ||
    path === '/portal/bestellingen' ||
    path === '/portal/facturen'

  if (isPortalPreview) return res

  // Portaal-zone: enkel inloggen vereist (toegang tot een bedrijf checkt
  // de portaalpagina zelf).
  if (inPortal && !isPortalAuth) {
    if (!user) {
      return NextResponse.redirect(new URL('/portal/login', req.url))
    }
    return res
  }

  if (isPublic(path)) return res

  // Beheer-zone.
  if (!user) {
    // Kale start-URL → standaard naar het klantenportaal (publieke ingang).
    // Medewerkers gebruiken /login (kruislink op het portaal-inlogscherm).
    if (path === '/') {
      return NextResponse.redirect(new URL('/portal/login', req.url))
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Is de ingelogde gebruiker een portaal-klant? Dan hoort hij niet in
  // het beheer — stuur hem naar zijn portaal.
  const { data: portal } = await supabase.rpc('my_portal_company')
  if (Array.isArray(portal) && portal.length > 0) {
    // Klant mag in zijn portaal én de webshop (/catalog), niet in het beheer.
    if (!path.startsWith('/catalog')) {
      return NextResponse.redirect(new URL('/portal', req.url))
    }
    return res
  }

  // Beheer-zone: enkel beheerders (staff-allowlist). Een ingelogd account dat
  // géén portaal-klant én géén beheerder is (bv. een oud/zwerf-account) hoort
  // hier niet — meteen uitloggen. Dit is de routing-laag bovenop de RLS.
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) {
    return NextResponse.redirect(new URL('/logout', req.url))
  }

  return res
}

export const config = {
  matcher: [
    // Alles behalve Next-interne assets en bestanden met een extensie.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|svg|gif|webp|ico|css|js|map|woff2?)).*)',
  ],
}
