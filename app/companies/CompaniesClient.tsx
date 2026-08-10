'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export type CompanyListItem = {
  id: string
  name: string
  contactName?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  hasContract: boolean
  locationCount: number
  nextVisitAt: string | null
  nextVisitId: string | null
  woDraft: number
  woSent: number
  woSigned: number
  openQuotes: number
  openActions: number
}

function formatDay(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function CompaniesClient({
  items,
  totalCount,
  pendingPortal,
  initialQ,
  error,
}: {
  items: CompanyListItem[]
  totalCount: number
  pendingPortal: number
  initialQ: string
  error: string | null
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQ)

  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim()
      const url = next
        ? `/companies?q=${encodeURIComponent(next)}`
        : '/companies'
      router.replace(url)
    }, 280)
    return () => clearTimeout(t)
  }, [q, router])

  const withActions = items.filter((c) => c.openActions > 0).length

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-6 sm:pt-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl leading-none text-stera-green sm:text-4xl">
              Klanten{' '}
              <span className="align-middle text-xl text-stera-ink-soft">
                {totalCount}
              </span>
            </h1>
            <p className="mt-1 text-sm text-stera-ink-soft">
              Open acties, contract en volgende onderhoud — klik voor het
              volledige klantbeeld.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/portal-aanvragen"
              className="stera-cta stera-cta-ghost relative"
            >
              Klantenportaal
              {pendingPortal > 0 ? (
                <span className="ml-2 rounded-full bg-stera-green px-1.5 text-xs font-semibold text-white">
                  {pendingPortal}
                </span>
              ) : null}
            </Link>
            <Link href="/companies/new" className="stera-cta stera-cta-primary">
              + Klant
            </Link>
          </div>
        </div>

        {/* Mini-stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-stera-line bg-white px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-stera-ink-soft">
              Klanten
            </p>
            <p className="text-xl font-semibold tabular-nums text-stera-ink">
              {totalCount}
            </p>
          </div>
          <div className="rounded-xl border border-stera-line bg-white px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-stera-ink-soft">
              Met open actie
            </p>
            <p
              className={`text-xl font-semibold tabular-nums ${
                withActions > 0 ? 'text-amber-800' : 'text-stera-green'
              }`}
            >
              {withActions}
            </p>
          </div>
          <div className="rounded-xl border border-stera-line bg-white px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-stera-ink-soft">
              Contract
            </p>
            <p className="text-xl font-semibold tabular-nums text-stera-green">
              {items.filter((c) => c.hasContract).length}
            </p>
          </div>
        </div>

        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek klant, contact, e-mail, stad…"
          className="w-full rounded-xl border border-stera-line bg-white px-4 py-3 text-sm text-stera-ink outline-none ring-stera-green/30 placeholder:text-stera-ink-soft focus:ring-2"
        />

        {error ? (
          <p className="text-red-600">Fout bij ophalen: {error}</p>
        ) : items.length === 0 ? (
          <div className="stera-empty space-y-2">
            <p className="stera-empty-title">
              {q ? 'Geen treffers' : 'Nog geen klanten'}
            </p>
            <p className="text-sm">
              {q
                ? 'Probeer een andere zoekterm.'
                : 'Klanten registreren zich via de webshop en verschijnen hier na goedkeuring.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/companies/${c.id}`}
                  className="stera-card block transition hover:border-stera-green"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-serif text-xl text-stera-green">
                          {c.name}
                        </p>
                        {c.hasContract ? (
                          <span className="rounded-full bg-stera-green/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stera-green">
                            Contract
                          </span>
                        ) : null}
                        {c.openActions > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                            {c.openActions} open
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-stera-ink-soft">
                        {[c.contactName, c.email, c.city]
                          .filter(Boolean)
                          .join(' · ') || 'Geen contactinfo'}
                      </p>
                      <p className="mt-1 text-xs text-stera-ink-soft">
                        {c.locationCount} locatie
                        {c.locationCount === 1 ? '' : 's'}
                        {c.nextVisitAt ? (
                          <>
                            {' · '}
                            Volgende:{' '}
                            <span className="font-medium text-stera-ink">
                              {formatDay(c.nextVisitAt)}
                            </span>
                          </>
                        ) : (
                          ' · Geen gepland onderhoud'
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {c.woDraft > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          {c.woDraft} te versturen
                        </span>
                      ) : null}
                      {c.woSent > 0 ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                          {c.woSent} te tekenen
                        </span>
                      ) : null}
                      {c.woSigned > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                          {c.woSigned} te factureren
                        </span>
                      ) : null}
                      {c.openQuotes > 0 ? (
                        <span className="rounded-full bg-stera-green/10 px-2 py-0.5 text-[10px] font-semibold text-stera-green">
                          {c.openQuotes} offerte
                          {c.openQuotes === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
