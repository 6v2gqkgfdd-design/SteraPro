'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { setOffered, setOfferedBulk } from './actions'

export type ProductGroup = {
  name: string
  category: string
  imageItemcode: string | null
  variants: { label: string; teelt: string | null; price: number; itemcode: string }[]
  minPrice: number
  maxPrice: number
  offered: boolean
}

const euro = (n: number) => `€ ${n.toFixed(2)}`

export default function CatalogSelectionClient({
  groups,
}: {
  groups: ProductGroup[]
}) {
  const [offeredMap, setOfferedMap] = useState<Record<string, boolean>>(
    () => Object.fromEntries(groups.map((g) => [g.name, g.offered]))
  )
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<'all' | 'on' | 'off'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  async function runSync() {
    setSyncing(true)
    setMsg('Bezig met synchroniseren naar Shopify… dit kan even duren.')
    try {
      const res = await fetch('/api/shopify/sync', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) setMsg(`Sync-fout: ${data.error}`)
      else setMsg(
        `Sync klaar — ${data.pushed} gepusht, ${data.removed} verwijderd` +
        (data.stockUpdated ? `, ${data.stockUpdated} voorraad bijgewerkt` : '') +
        (data.failed ? `, ${data.failed} fout` : '') + '.' +
        (data.failed && data.errors?.length ? ` Eerste fout: ${data.errors[0]}` : '')
      )
    } catch (e) {
      setMsg(`Sync-fout: ${e instanceof Error ? e.message : 'onbekend'}`)
    } finally {
      setSyncing(false)
    }
  }

  const categories = useMemo(
    () => [...new Set(groups.map((g) => g.category))].sort(),
    [groups]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false
      if (category && g.category !== category) return false
      if (status === 'on' && !offeredMap[g.name]) return false
      if (status === 'off' && offeredMap[g.name]) return false
      return true
    })
  }, [groups, search, category, status, offeredMap])

  const offeredCount = useMemo(
    () => Object.values(offeredMap).filter(Boolean).length,
    [offeredMap]
  )

  function toggle(name: string, next: boolean) {
    setOfferedMap((m) => ({ ...m, [name]: next })) // optimistisch
    startTransition(async () => {
      const res = await setOffered(name, next)
      if (!res.ok) {
        setOfferedMap((m) => ({ ...m, [name]: !next })) // terugdraaien
        setMsg(`Fout: ${res.error}`)
      }
    })
  }

  function bulk(next: boolean) {
    const names = filtered.map((g) => g.name)
    if (names.length === 0) return
    const prev = { ...offeredMap }
    setOfferedMap((m) => {
      const copy = { ...m }
      for (const n of names) copy[n] = next
      return copy
    })
    startTransition(async () => {
      const res = await setOfferedBulk(names, next)
      if (!res.ok) {
        setOfferedMap(prev)
        setMsg(`Fout: ${res.error}`)
      } else {
        setMsg(`${names.length} producten ${next ? 'aangezet' : 'uitgezet'}.`)
      }
    })
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="stera-eyebrow mb-2">Admin · Webshop</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Assortiment selecteren</h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Kies welke combinaties in de SteraPro-webshop komen. Elk product toont zijn
            maten/varianten — klik op een product om ze te zien. Enkel wat hier aanstaat
            wordt naar Shopify gepusht.
          </p>
        </div>

        <div className="stera-card sticky top-0 z-10 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op naam…"
              className="w-full rounded-lg border border-stera-line bg-white p-2.5 text-sm"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-2.5 text-sm"
            >
              <option value="">Alle categorieën</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="w-full rounded-lg border border-stera-line bg-white p-2.5 text-sm"
            >
              <option value="all">Alle (aan + uit)</option>
              <option value="on">Enkel aangeboden</option>
              <option value="off">Enkel niet-aangeboden</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-stera-ink-soft">
              <strong className="text-stera-ink">{offeredCount}</strong> aangeboden ·{' '}
              {filtered.length} getoond · {groups.length} totaal
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => bulk(true)}
                disabled={pending || filtered.length === 0}
                className="stera-cta stera-cta-primary text-sm disabled:opacity-50"
              >
                Alle getoonde aanbieden
              </button>
              <button
                type="button"
                onClick={() => bulk(false)}
                disabled={pending || filtered.length === 0}
                className="stera-cta stera-cta-secondary text-sm disabled:opacity-50"
              >
                Alle getoonde uitzetten
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-stera-line/60 pt-3">
            <button
              type="button"
              onClick={runSync}
              disabled={syncing || pending}
              className="stera-cta stera-cta-primary text-sm disabled:opacity-50"
            >
              {syncing ? 'Bezig met synchroniseren…' : '↑ Sync naar Shopify'}
            </button>
            <span className="text-xs text-stera-ink-soft">
              Zet de webshop gelijk aan je selectie ({offeredCount} aangeboden).
            </span>
          </div>
          {msg ? <p className="text-xs text-stera-ink-soft">{msg}</p> : null}
        </div>

        <ul className="space-y-2">
          {filtered.map((g) => {
            const on = !!offeredMap[g.name]
            const isOpen = expanded === g.name
            return (
              <li
                key={g.name}
                className={`rounded-xl border bg-white ${on ? 'border-stera-green/40' : 'border-stera-line'}`}
              >
                <div className="flex items-center gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : g.name)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {g.imageItemcode ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/nieuwkoop/image/${encodeURIComponent(g.imageItemcode)}`}
                        alt={g.name}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-stera-line text-[10px] text-stera-ink-soft">
                        geen foto
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-stera-ink">{g.name}</p>
                      <p className="text-xs text-stera-ink-soft">
                        {g.category} · {g.variants.length}{' '}
                        {g.variants.length === 1 ? 'maat' : 'maten'} ·{' '}
                        {g.minPrice === g.maxPrice
                          ? euro(g.minPrice)
                          : `${euro(g.minPrice)} – ${euro(g.maxPrice)}`}{' '}
                        <span className="text-stera-ink-soft/70">
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(g.name, !on)}
                    disabled={pending}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      on
                        ? 'bg-stera-green text-white'
                        : 'border border-stera-line bg-white text-stera-ink-soft'
                    }`}
                  >
                    {on ? '✓ Aangeboden' : 'Aanbieden'}
                  </button>
                </div>

                {isOpen ? (
                  <div className="border-t border-stera-line/70 px-3 py-2">
                    <table className="w-full text-xs">
                      <thead className="text-stera-ink-soft">
                        <tr className="text-left">
                          <th className="py-1 font-medium">Maat</th>
                          <th className="py-1 font-medium">Teelt</th>
                          <th className="py-1 font-medium">Prijs (excl. btw)</th>
                          <th className="py-1 font-medium">Itemcode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.variants.map((v) => (
                          <tr key={v.itemcode} className="border-t border-stera-line/40">
                            <td className="py-1">{v.label}</td>
                            <td className="py-1">{v.teelt ?? '—'}</td>
                            <td className="py-1">{euro(v.price)}</td>
                            <td className="py-1 font-mono text-stera-ink-soft">{v.itemcode}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>

        {filtered.length === 0 ? (
          <p className="text-center text-sm text-stera-ink-soft">Geen producten voor deze filter.</p>
        ) : null}

        <div className="pt-2 text-sm">
          <Link href="/dashboard" className="text-stera-green underline-offset-4 hover:underline">
            ← Terug naar dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
