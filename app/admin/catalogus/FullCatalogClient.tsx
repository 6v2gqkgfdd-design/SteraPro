'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  setItemOffered,
  setItemsOfferedBulk,
  acknowledgeChanges,
  acknowledgeAllOpen,
} from './actions'

type Tab = 'new' | 'all' | 'offered' | 'oos' | 'discontinued'

type CatalogItem = {
  itemcode: string
  description: string
  detail?: string | null
  costPrice?: number | null
  mainGroup?: string | null
  productGroup?: string | null
  group?: string | null
  variety?: string | null
  potSize?: string | null
  diameter?: number | null
  height?: number | null
  length?: number | null
  width?: number | null
  imageItemcode?: string | null
  deliveryDays?: number | null
  activeAtSource?: boolean
  stock?: number
  offered?: boolean
  showOnWebsite?: boolean | null
  // change fields
  changeId?: string
  changeType?: string
  summary?: string
  createdAt?: string
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'new', label: 'Nieuw / wijzigingen' },
  { id: 'all', label: 'Hele catalogus' },
  { id: 'offered', label: 'Aangeboden' },
  { id: 'oos', label: 'Uit voorraad' },
  { id: 'discontinued', label: 'Verdwenen' },
]

const CHANGE_LABEL: Record<string, string> = {
  new: 'Nieuw',
  back_in_stock: 'Weer op voorraad',
  price_changed: 'Prijs',
  spec_changed: 'Specs',
  discontinued: 'Verdwenen',
}

const euro = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? '—' : `€ ${Number(n).toFixed(2)}`

function specsLine(it: CatalogItem) {
  const parts: string[] = []
  if (it.height) parts.push(`H ${Math.round(Number(it.height))} cm`)
  if (it.diameter) parts.push(`Ø ${Math.round(Number(it.diameter))} cm`)
  if (it.length && it.width)
    parts.push(`${Math.round(Number(it.length))}×${Math.round(Number(it.width))} cm`)
  if (it.potSize) parts.push(`pot ${it.potSize}`)
  if (it.variety) parts.push(it.variety)
  return parts.join(' · ')
}

export default function FullCatalogClient() {
  const [tab, setTab] = useState<Tab>('new')
  const [q, setQ] = useState('')
  const [mainGroup, setMainGroup] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(40)
  const [openChanges, setOpenChanges] = useState(0)
  const [offeredTotal, setOfferedTotal] = useState(0)
  const [mainGroups, setMainGroups] = useState<{ name: string; count: number }[]>([])
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [warning, setWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setWarning(null)
    try {
      const params = new URLSearchParams({
        tab,
        page: String(page),
        q,
        main_group: mainGroup,
      })
      const res = await fetch(`/api/admin/catalog?${params}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        setMsg(data.error || 'Laden mislukt')
        setItems([])
        return
      }
      setItems(data.items || [])
      setTotal(data.total ?? 0)
      setPageSize(data.pageSize ?? 40)
      if (typeof data.openChanges === 'number') setOpenChanges(data.openChanges)
      if (typeof data.offeredTotal === 'number') setOfferedTotal(data.offeredTotal)
      if (data.mainGroups) setMainGroups(data.mainGroups)
      if (data.typeCounts) setTypeCounts(data.typeCounts)
      if (data.warning) setWarning(data.warning)
      setSelected(new Set())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Laden mislukt')
    } finally {
      setLoading(false)
    }
  }, [tab, page, q, mainGroup])

  useEffect(() => {
    void load()
  }, [load])

  // Debounce search: reset page when filters change
  function changeTab(t: Tab) {
    setTab(t)
    setPage(1)
    setExpanded(null)
  }

  function toggleOffer(itemcode: string, next: boolean) {
    setItems((list) =>
      list.map((it) => (it.itemcode === itemcode ? { ...it, offered: next } : it))
    )
    startTransition(async () => {
      const res = await setItemOffered(itemcode, next)
      if (!res.ok) {
        setMsg(res.error)
        void load()
      } else {
        setOfferedTotal((n) => n + (next ? 1 : -1))
      }
    })
  }

  function bulkOffer(next: boolean) {
    const codes =
      selected.size > 0
        ? [...selected]
        : items.map((it) => it.itemcode).filter(Boolean)
    if (!codes.length) return
    startTransition(async () => {
      const res = await setItemsOfferedBulk(codes, next)
      if (!res.ok) setMsg(res.error)
      else {
        setMsg(`${codes.length} items ${next ? 'aangeboden' : 'uitgezet'}.`)
        void load()
      }
    })
  }

  function ackSelected() {
    const ids = items
      .filter((it) => it.changeId && selected.has(it.changeId))
      .map((it) => it.changeId!)
    const allIds = ids.length ? ids : items.map((it) => it.changeId!).filter(Boolean)
    if (!allIds.length) return
    startTransition(async () => {
      const res = await acknowledgeChanges(allIds)
      if (!res.ok) setMsg(res.error)
      else {
        setMsg(`${allIds.length} wijzigingen gemarkeerd als bekeken.`)
        void load()
      }
    })
  }

  function ackAll() {
    startTransition(async () => {
      const res = await acknowledgeAllOpen()
      if (!res.ok) setMsg(res.error)
      else {
        setMsg('Alle open wijzigingen gemarkeerd als bekeken.')
        void load()
      }
    })
  }

  async function runSync() {
    setSyncing(true)
    setMsg('Bezig met synchroniseren naar Shopify…')
    try {
      const res = await fetch('/api/shopify/sync', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) setMsg(`Sync-fout: ${data.error}`)
      else
        setMsg(
          `Sync klaar — ${data.pushed} gepusht, ${data.removed} verwijderd` +
            (data.failed ? `, ${data.failed} fout` : '') +
            '.'
        )
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Sync-fout')
    } finally {
      setSyncing(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const isNew = tab === 'new'

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <p className="stera-eyebrow mb-2">Admin · Webshop</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Catalogus</h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Volledige Nieuwkoop-catalogus in Supabase. Filter, bekijk specs, kies wat je
            aanbiedt, en sync enkel die selectie naar Shopify. Bij 0 voorraad blijft het
            product verkoopbaar (op bestelling).
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const badge =
              t.id === 'new'
                ? openChanges
                : t.id === 'offered'
                  ? offeredTotal
                  : null
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => changeTab(t.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.id
                    ? 'bg-stera-green text-white'
                    : 'border border-stera-line bg-white text-stera-ink-soft hover:border-stera-green/40'
                }`}
              >
                {t.label}
                {badge != null && badge > 0 ? (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                      tab === t.id ? 'bg-white/20' : 'bg-stera-green/10 text-stera-green'
                    }`}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {isNew && Object.keys(typeCounts).length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-stera-ink-soft">
            {Object.entries(typeCounts).map(([k, n]) => (
              <span key={k} className="rounded-full border border-stera-line bg-white px-2 py-1">
                {CHANGE_LABEL[k] || k}: <strong className="text-stera-ink">{n}</strong>
              </span>
            ))}
          </div>
        ) : null}

        {/* Filters */}
        <div className="stera-card space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              placeholder="Zoek op naam, itemcode, variety…"
              className="w-full rounded-lg border border-stera-line bg-white p-2.5 text-sm"
            />
            {!isNew ? (
              <select
                value={mainGroup}
                onChange={(e) => {
                  setMainGroup(e.target.value)
                  setPage(1)
                }}
                className="w-full rounded-lg border border-stera-line bg-white p-2.5 text-sm"
              >
                <option value="">Alle hoofdgroepen</option>
                {mainGroups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name} ({g.count})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center text-sm text-stera-ink-soft">
                Open wijzigingen van de ochtend-scan
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-stera-ink-soft">
              {loading ? 'Laden…' : (
                <>
                  <strong className="text-stera-ink">{total}</strong> resultaten · pagina {page}/
                  {totalPages}
                </>
              )}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {isNew ? (
                <>
                  <button
                    type="button"
                    onClick={ackSelected}
                    disabled={pending || items.length === 0}
                    className="stera-cta stera-cta-secondary text-sm disabled:opacity-50"
                  >
                    Markeer als bekeken
                  </button>
                  <button
                    type="button"
                    onClick={ackAll}
                    disabled={pending || openChanges === 0}
                    className="stera-cta stera-cta-secondary text-sm disabled:opacity-50"
                  >
                    Alles bekeken
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkOffer(true)}
                    disabled={pending || items.length === 0}
                    className="stera-cta stera-cta-primary text-sm disabled:opacity-50"
                  >
                    Aanbieden
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => bulkOffer(true)}
                    disabled={pending || items.length === 0}
                    className="stera-cta stera-cta-primary text-sm disabled:opacity-50"
                  >
                    {selected.size ? 'Selectie' : 'Pagina'} aanbieden
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkOffer(false)}
                    disabled={pending || items.length === 0}
                    className="stera-cta stera-cta-secondary text-sm disabled:opacity-50"
                  >
                    Uitzetten
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-stera-line/60 pt-3">
            <button
              type="button"
              onClick={runSync}
              disabled={syncing || pending}
              className="stera-cta stera-cta-primary text-sm disabled:opacity-50"
            >
              {syncing ? 'Bezig…' : '↑ Sync naar Shopify'}
            </button>
            <span className="text-xs text-stera-ink-soft">
              Pusht de aangeboden selectie ({offeredTotal}). 0-stock = op bestelling.
            </span>
          </div>
          {warning ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {warning} Pas <code>20260805120000_catalog_full_tracking.sql</code> toe in
              Supabase SQL Editor.
            </p>
          ) : null}
          {msg ? <p className="text-xs text-stera-ink-soft">{msg}</p> : null}
        </div>

        {/* List */}
        <ul className="space-y-2">
          {items.map((it) => {
            const key = isNew ? String(it.changeId) : it.itemcode
            const isOpen = expanded === key
            const selId = isNew ? String(it.changeId) : it.itemcode
            const on = !!it.offered
            return (
              <li
                key={key}
                className={`rounded-xl border bg-white ${
                  on ? 'border-stera-green/40' : 'border-stera-line'
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(selId)}
                    onChange={() => toggleSelect(selId)}
                    className="shrink-0"
                    aria-label="Selecteer"
                  />
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {it.imageItemcode ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/nieuwkoop/image/${encodeURIComponent(String(it.imageItemcode))}`}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-stera-line text-[10px] text-stera-ink-soft">
                        geen foto
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-stera-ink">{it.description}</p>
                        {isNew && it.changeType ? (
                          <span className="shrink-0 rounded-full bg-stera-green/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stera-green">
                            {CHANGE_LABEL[it.changeType] || it.changeType}
                          </span>
                        ) : null}
                        {it.stock != null && it.stock <= 0 && tab !== 'discontinued' ? (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Op bestelling
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-stera-ink-soft">
                        {[it.mainGroup, it.productGroup].filter(Boolean).join(' · ')}
                        {it.summary ? ` · ${it.summary}` : ''}
                      </p>
                      <p className="text-xs text-stera-ink-soft">
                        <span className="font-mono">{it.itemcode}</span>
                        {specsLine(it) ? ` · ${specsLine(it)}` : ''}
                        {it.costPrice != null ? ` · inkoop ${euro(it.costPrice)}` : ''}
                        {it.stock != null && !isNew ? ` · stock ${it.stock}` : ''}{' '}
                        <span className="text-stera-ink-soft/70">{isOpen ? '▲' : '▼'}</span>
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleOffer(it.itemcode, !on)}
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
                  <div className="space-y-2 border-t border-stera-line/70 px-3 py-3 text-xs text-stera-ink">
                    {it.detail ? <p className="text-stera-ink-soft">{it.detail}</p> : null}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                      <div>
                        <dt className="text-stera-ink-soft">Itemcode</dt>
                        <dd className="font-mono">{it.itemcode}</dd>
                      </div>
                      <div>
                        <dt className="text-stera-ink-soft">Inkoop</dt>
                        <dd>{euro(it.costPrice)}</dd>
                      </div>
                      <div>
                        <dt className="text-stera-ink-soft">Voorraad</dt>
                        <dd>
                          {it.stock != null
                            ? it.stock > 0
                              ? it.stock
                              : '0 (op bestelling)'
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stera-ink-soft">Hoogte</dt>
                        <dd>{it.height ? `${Math.round(Number(it.height))} cm` : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-stera-ink-soft">Diameter</dt>
                        <dd>
                          {it.diameter ? `${Math.round(Number(it.diameter))} cm` : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stera-ink-soft">Levertijd</dt>
                        <dd>
                          {it.deliveryDays != null ? `${it.deliveryDays} dagen` : '—'}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-stera-ink-soft">Hoofdgroep</dt>
                        <dd>{it.mainGroup || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-stera-ink-soft">Productgroep</dt>
                        <dd>{it.productGroup || '—'}</dd>
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <dt className="text-stera-ink-soft">Variety</dt>
                        <dd>{it.variety || '—'}</dd>
                      </div>
                    </dl>
                    <p className="pt-1">
                      <Link
                        href={`/catalog/${encodeURIComponent(it.itemcode)}`}
                        className="text-stera-green underline-offset-2 hover:underline"
                      >
                        Open detail in catalogus →
                      </Link>
                    </p>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>

        {!loading && items.length === 0 ? (
          <p className="text-center text-sm text-stera-ink-soft">
            {isNew
              ? 'Geen open wijzigingen. Na de ochtend-scan verschijnen hier nieuwe items, prijs- en specswijzigingen, weer op voorraad en verdwenen artikelen.'
              : 'Geen producten voor deze filter.'}
          </p>
        ) : null}

        {/* Paginatie */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="stera-cta stera-cta-secondary text-sm disabled:opacity-40"
            >
              Vorige
            </button>
            <span className="text-sm text-stera-ink-soft">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="stera-cta stera-cta-secondary text-sm disabled:opacity-40"
            >
              Volgende
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-4 pt-2 text-sm">
          <Link href="/admin/catalogus/combinaties" className="text-stera-green underline-offset-4 hover:underline">
            Oude combi-selectie →
          </Link>
          <Link href="/dashboard" className="text-stera-ink-soft underline-offset-4 hover:underline">
            ← Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
