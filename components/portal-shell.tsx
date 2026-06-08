import Link from 'next/link'

/**
 * Klantenportaal "Mijn Stera Pro" — schil in de Stera Pro-huisstijl
 * (groene sidebar + cream content), zoals het prototype. Voorlopig met
 * voorbeelddata; de echte koppeling (Shopify-login + SECURITY DEFINER
 * RPC's per klant) volgt in een latere fase.
 */

type NavItem = { href: string; label: string }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overzicht', items: [{ href: '/portal/dashboard', label: 'Dashboard' }] },
  {
    group: 'Service',
    items: [
      { href: '/portal/onderhoud', label: 'Onderhoud' },
      { href: '/portal/planten', label: 'Mijn planten' },
      { href: '/portal/leveringen', label: 'Leveringen' },
      { href: '/portal/contract', label: 'Contract' },
    ],
  },
  {
    group: 'Commercieel',
    items: [
      { href: '/portal/offertes', label: 'Offertes' },
      { href: '/portal/bestellingen', label: 'Bestellingen' },
      { href: '/portal/facturen', label: 'Facturen' },
    ],
  },
]

export default function PortalShell({
  active,
  company = 'Mijn bedrijf',
  children,
}: {
  active: string
  company?: string
  children: React.ReactNode
}) {
  const initials = company.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'SP'
  return (
    <div className="min-h-screen bg-stera-cream">
      {/* Naadloze toggle bovenaan — Webshop <-> Mijn Stera Pro */}
      <div className="sticky top-0 z-50 flex h-10 items-center justify-end bg-stera-green-deep px-4 md:px-6">
        <div className="flex gap-1 rounded-full bg-white/10 p-0.5">
          <a
            href="https://sterapro.be"
            className="rounded-full px-4 py-1 text-xs font-semibold text-stera-cream/70 transition hover:text-stera-cream"
          >
            Webshop
          </a>
          <span className="rounded-full bg-stera-cream px-4 py-1 text-xs font-semibold text-stera-green-deep">
            Mijn Stera Pro
          </span>
        </div>
      </div>
      <aside className="fixed bottom-0 left-0 top-10 z-40 hidden w-64 flex-col bg-stera-green-deep px-3 py-6 md:flex">
        <Link href="/portal/dashboard" className="mb-6 inline-flex px-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://sterapro.be/cdn/shop/files/Zonder_titel_320_x_112_px_-3.png"
            alt="Stera Pro"
            className="h-8 w-auto select-none"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </Link>
        <nav className="flex flex-col">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="px-3.5 pb-1.5 pt-4 text-[11px] uppercase tracking-wider text-stera-cream/45">
                {g.group}
              </p>
              {g.items.map((it) => {
                const on = it.href === active
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={on ? 'page' : undefined}
                    className={`mb-0.5 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] transition ${
                      on
                        ? 'bg-white/15 font-medium text-stera-cream'
                        : 'text-stera-cream/70 hover:bg-white/10 hover:text-stera-cream'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                    {it.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="md:pl-64">
      <header className="sticky top-10 z-10 flex h-[70px] items-center justify-between border-b border-stera-line bg-stera-cream px-6 md:px-9">
        <span className="text-sm text-stera-ink-soft">Mijn Stera Pro</span>
        <span className="flex items-center gap-2.5 text-sm text-stera-green">
          {company}
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stera-green text-xs font-semibold text-stera-cream">
            {initials}
          </span>
        </span>
      </header>

      <main className="px-6 py-8 md:px-9">{children}</main>
      </div>
    </div>
  )
}

export function PageHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-7">
      <h1 className="font-serif text-4xl leading-none text-stera-green">{title}</h1>
      {sub ? <p className="mt-2 text-sm text-stera-ink-soft">{sub}</p> : null}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-stera-line bg-white p-5">
      <p className="text-[11px] uppercase tracking-wider text-stera-ink-soft">{label}</p>
      <p className="mt-1.5 font-serif text-3xl leading-none text-stera-green">{value}</p>
      {hint ? <p className="mt-2 text-xs text-stera-green">{hint}</p> : null}
    </div>
  )
}

export function Panel({
  title,
  source,
  children,
}: {
  title: string
  source?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-stera-line bg-white">
      <div className="flex items-center justify-between border-b border-stera-line px-5 py-4">
        <span className="text-[15px] font-medium text-stera-green">{title}</span>
        {source ? (
          <span className="rounded-full bg-stera-cream-deep px-2.5 py-1 text-[11px] text-stera-ink-soft">
            {source}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

type Cell = string | { tag: 'ok' | 'warn' | 'info'; text: string }
const TAG: Record<'ok' | 'warn' | 'info', string> = {
  ok: 'bg-[#e3f0e6] text-[#2f5840]',
  warn: 'bg-[#f6ecd6] text-[#7a5a14]',
  info: 'bg-[#e4eef6] text-[#1c557e]',
}

export function DataTable({ head, rows }: { head: string[]; rows: Cell[][] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {head.map((h) => (
            <th
              key={h}
              className="border-b border-stera-line px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stera-ink-soft"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-stera-line">
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td
                key={j}
                className="px-5 py-3 text-sm text-stera-ink-soft"
              >
                {typeof cell === 'string' ? (
                  cell
                ) : (
                  <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${TAG[cell.tag]}`}>
                    {cell.text}
                  </span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
