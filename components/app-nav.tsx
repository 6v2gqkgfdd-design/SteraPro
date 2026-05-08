'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = {
  href: string
  label: string
  icon: 'home' | 'maintenance' | 'workorders' | 'companies'
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
    matches: (p) =>
      p.startsWith('/maintenance') ||
      p.startsWith('/plants/') ||
      p.startsWith('/rooms/') ||
      p === '/scan' ||
      p.startsWith('/plants/search'),
  },
  {
    href: '/work-orders',
    label: 'Werkbonnen',
    icon: 'workorders',
    matches: (p) => p.startsWith('/work-orders'),
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

const HIDDEN_PREFIXES = ['/login', '/signup', '/p/', '/sign/']

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
        <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1">
          {TABS.map((tab) => {
            const active = tab.matches(pathname)
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition ${
                    active
                      ? 'text-stera-green'
                      : 'text-stera-ink/65 hover:text-stera-ink'
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
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 transition ${
                    active
                      ? 'bg-stera-green/10 text-stera-green'
                      : 'text-stera-ink/65 hover:text-stera-ink'
                  }`}
                  aria-current={active ? 'page' : undefined}
                  title={tab.label}
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
    case 'workorders':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3h6a2 2 0 0 1 2 2v0H7v0a2 2 0 0 1 2-2Z" />
          <path d="M7 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <path d="M8 11h8M8 15h5" />
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
  }
}
