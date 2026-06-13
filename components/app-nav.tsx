'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = {
  href: string
  label: string
  icon: 'home' | 'maintenance' | 'quotes' | 'companies' | 'webshop'
  matches: (path: string) => boolean
}

const TABS: Tab[] = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: 'home',
    matches: (p) => p === '/dashboard' || p === '/',
  },
  {
    href: '/maintenance',
    label: 'Onderhoud',
    icon: 'maintenance',
    // Werkbonnen horen bij het onderhoud en lichten dus de Onderhoud-tab op.
    matches: (p) =>
      p.startsWith('/maintenance') ||
      p.startsWith('/work-orders') ||
      p === '/scan' ||
      p.startsWith('/plants/search'),
  },
  {
    href: '/quotes',
    label: 'Offertes',
    icon: 'quotes',
    // De catalogus is bereikbaar vanuit het offertes-gedeelte.
    matches: (p) => p.startsWith('/quotes') || p.startsWith('/catalog'),
  },
  {
    href: '/companies',
    label: 'Klanten',
    icon: 'companies',
    matches: (p) =>
      p === '/companies' ||
      p.startsWith('/companies/') ||
      p.startsWith('/locations/') ||
      p.startsWith('/rooms/') ||
      p.startsWith('/plants/'),
  },
  {
    href: '/admin/catalogus',
    label: 'Catalogus',
    icon: 'webshop',
    matches: (p) => p.startsWith('/admin/catalogus'),
  },
]

// Beheerders-navigatie verbergen op publieke/klant-schermen. Het
// klantenportaal (/portal) heeft een eigen menu.
const HIDDEN_PREFIXES = ['/login', '/signup', '/p/', '/sign/', '/q/', '/portal']

export default function AppNav() {
  const pathname = usePathname() || ''

  // Print-/PDF-weergaven (bv. /work-orders/[id]/print) krijgen een
  // volledig schoon scherm zonder navigatie.
  if (
    pathname.endsWith('/print') ||
    HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))
  ) {
    return null
  }

  return (
    <>
      {/* Mobile: vaste bottom-nav */}
      <nav
        aria-label="Hoofdnavigatie"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-stera-line bg-stera-cream/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
          {TABS.map((tab) => {
            const active = tab.matches(pathname)
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition ${
                    active
                      ? 'text-stera-green'
                      : 'text-stera-ink/70 hover:text-stera-ink'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <NavIcon name={tab.icon} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider">
                    {tab.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Desktop: groene sidebar in Stera Pro-huisstijl */}
      <aside
        aria-label="Hoofdnavigatie"
        className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden bg-stera-green px-3 py-6 md:flex"
      >
        {/* Zacht S-watermerk, centraal-onderaan in de groene balk.
            GÉÉN invert-filter: de open ruimtes van de S zijn wit ingevuld;
            mix-blend-mode soft-light laat de S juist leesbaar doorschemeren. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[10%] left-1/2 -translate-x-1/2"
          style={{
            width: 215,
            height: 215,
            opacity: 0.5,
            mixBlendMode: 'soft-light',
            backgroundImage: 'url(/stera-logo-short.png)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
          }}
        />
        <ul className="relative z-10 mt-2 flex w-full flex-col items-stretch gap-1">
          {TABS.map((tab) => {
            const active = tab.matches(pathname)
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] transition ${
                    active
                      ? 'bg-white/15 font-medium text-stera-cream'
                      : 'text-stera-cream/70 hover:bg-white/10 hover:text-stera-cream'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <NavIcon name={tab.icon} />
                  <span>{tab.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>

      </aside>
    </>
  )
}

function NavIcon({ name }: { name: Tab['icon'] }) {
  const size = 24

  switch (name) {
    case 'home':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      )
    case 'maintenance':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
          <path d="m9 15 2 2 4-4" />
        </svg>
      )
    case 'quotes':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M14.5 11.6a2.4 2.4 0 1 0 0 4.8" />
          <path d="M8.6 13.2h4.4M8.6 14.8h4.4" />
        </svg>
      )
    case 'companies':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21V7l7-4 7 4v14" />
          <path d="M14 21V11h7v10" />
          <path d="M7 9h0M7 13h0M7 17h0" />
        </svg>
      )
    case 'webshop':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9 4.5 4h15L21 9" />
          <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
          <path d="M3 9h18" />
          <path d="M9 9v3a3 3 0 0 0 6 0V9" />
        </svg>
      )
  }
}
