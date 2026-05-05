'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = {
  href: string
  label: string
  icon: 'home' | 'maintenance' | 'scan' | 'search' | 'companies'
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
    matches: (p) => p.startsWith('/maintenance'),
  },
  {
    href: '/scan',
    label: 'Scan',
    icon: 'scan',
    matches: (p) => p === '/scan',
  },
  {
    href: '/plants/search',
    label: 'Zoeken',
    icon: 'search',
    matches: (p) =>
      p.startsWith('/plants/search') ||
      p.startsWith('/plants/') ||
      p.startsWith('/rooms/'),
  },
  {
    href: '/companies',
    label: 'Klanten',
    icon: 'companies',
    matches: (p) =>
      p === '/companies' ||
      p.startsWith('/companies/') ||
      p.startsWith('/locations/'),
  },
]

const HIDDEN_PREFIXES = ['/login', '/signup', '/p/']

export default function AppNav() {
  const pathname = usePathname() || ''

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
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
        <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 py-1">
          {TABS.map((tab) => {
            const active = tab.matches(pathname)
            const isScan = tab.icon === 'scan'
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition ${
                    isScan
                      ? 'mx-1 my-1 bg-stera-green text-white shadow-sm hover:bg-stera-green-deep'
                      : active
                        ? 'text-stera-green'
                        : 'text-stera-ink/65 hover:text-stera-ink'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <NavIcon name={tab.icon} active={active} accent={isScan} />
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                      isScan ? 'text-white' : ''
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Desktop: verticale rail links */}
      <aside
        aria-label="Hoofdnavigatie"
        className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center gap-2 border-r border-stera-line bg-stera-cream/95 py-6 backdrop-blur md:flex"
      >
        <Link href="/dashboard" className="mb-4 inline-flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/stera-logo-short.png"
            alt="Stera"
            className="h-9 w-9 select-none"
          />
        </Link>

        <ul className="flex w-full flex-col items-stretch gap-1 px-2">
          {TABS.map((tab) => {
            const active = tab.matches(pathname)
            const isScan = tab.icon === 'scan'
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 transition ${
                    isScan
                      ? 'bg-stera-green text-white hover:bg-stera-green-deep'
                      : active
                        ? 'bg-stera-green/10 text-stera-green'
                        : 'text-stera-ink/65 hover:text-stera-ink'
                  }`}
                  aria-current={active ? 'page' : undefined}
                  title={tab.label}
                >
                  <NavIcon name={tab.icon} active={active} accent={isScan} />
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                      isScan ? 'text-white' : ''
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </aside>
    </>
  )
}

function NavIcon({
  name,
  active,
  accent,
}: {
  name: Tab['icon']
  active: boolean
  accent: boolean
}) {
  const stroke = accent
    ? 'currentColor'
    : active
      ? 'currentColor'
      : 'currentColor'
  const size = accent ? 26 : 22

  switch (name) {
    case 'home':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      )
    case 'maintenance':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
          <path d="m9 15 2 2 4-4" />
        </svg>
      )
    case 'scan':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8V6a2 2 0 0 1 2-2h2" />
          <path d="M16 4h2a2 2 0 0 1 2 2v2" />
          <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
          <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
          <rect x="8" y="8" width="8" height="8" rx="1" />
        </svg>
      )
    case 'search':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      )
    case 'companies':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21V7l7-4 7 4v14" />
          <path d="M14 21V11h7v10" />
          <path d="M7 9h0M7 13h0M7 17h0" />
        </svg>
      )
  }
}
