'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  setItemOffered,
  setItemsOfferedBulk,
  acknowledgeChanges,
  acknowledgeAllOpen,
} from './actions'
import CatalogDetailDrawer from './CatalogDetailDrawer'
import {
  CATALOG_TYPES,
  HEIGHT_BANDS,
  OFFERED_OPTIONS,
  OPTIMIZED_OPTIONS,
  PHOTO_OPTIONS,
  PRICE_BANDS,
  STOCK_OPTIONS,
} from '@/lib/catalog-filters'
import { LOCATION_FILTER_OPTIONS, locationAppliesToType } from '@/lib/location'
import { catalogThumbUrl } from '@/lib/product-media'

/** Lokale opslag zodat filters/pagina overleven bij re-render of per ongeluk refresh. */
const STATE_KEY = 'stera-admin-catalog-v1'

type Tab = 'new' | 'all' | 'offered'

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
  catalogType?: string | null
  brand?: string | null
  location?: string | null
  locations?: string[]
  locationSource?: string
  locationRelevant?: boolean
  plantsoort?: string | null
  readyForShopify?: boolean
  optimized?: boolean
  hasStudioImage?: boolean
  studioImagePath?: string | null
  changeId?: string
  changeType?: string
  summary?: string
  createdAt?: string
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'new', label: 'Nieuw / wijzigingen' },
  { id: 'all', label: 'Hele catalogus' },
  { id: 'offered', label: 'Aangeboden' },
]

const CHANGE_LABEL: Record<string, string> = {
  new: 'Nieuw',
  back_in_stock: 'Weer op voorraad',
  price_changed: 'Prijs',
  spec_changed: 'Specs',
  discontinued: 'Verdwenen',
}

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CATALOG_TYPES.filter((t) => t.id).map((t) => [t.id, t.label])
)

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

type Filters = {
  q: string
  type: string
  location: string
  stock: string
  photo: string
  offered: string
  price: string
  height: string
  brand: string
  plantsoort: string
  optimized: string
}

const EMPTY_FILTERS: Filters = {
  q: '',
  type: '',
  location: '',
  stock: '',
  photo: '',
  offered: '',
  price: '',
  height: '',
  brand: '',
  plantsoort: '',
  optimized: '',
}

function loadSavedState(): {
  tab: Tab
  filters: Filters
  page: number
  scroll: number
} | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STATE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as {
      tab?: string
      filters?: Partial<Filters>
      page?: number
      scroll?: number
    }
    // Oude tabs (oos/discontinued) vallen terug op hele catalogus
    const tab: Tab =
      s.tab === 'new' || s.tab === 'offered' || s.tab === 'all' ? s.tab : 'all'
    return {
      tab,
      filters: { ...EMPTY_FILTERS, ...(s.filters || {}) },
      page: Math.max(1, Number(s.page) || 1),
      scroll: Number(s.scroll) || 0,
    }
  } catch {
    return null
  }
}

export default function FullCatalogClient() {
  const saved = useRef(loadSavedState())
  const listScrollRef = useRef(saved.current?.scroll ?? 0)
  const restoreScrollOnce = useRef(true)

  // Detail = pure React-state → geen navigatie, geen filter-verlies.
  const [detailCode, setDetailCode] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(() => saved.current?.tab ?? 'all')
  const [filters, setFilters] = useState<Filters>(
    () => saved.current?.filters ?? EMPTY_FILTERS
  )
  const [draftQ, setDraftQ] = useState(() => saved.current?.filters?.q ?? '')
  const [page, setPage] = useState(() => saved.current?.page ?? 1)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(40)
  const [openChanges, setOpenChanges] = useState(0)
  const [offeredTotal, setOfferedTotal] = useState(0)
  const [brands, setBrands] = useState<{ name: string; count: number }[]>([])
  const [plantsoorten, setPlantsoorten] = useState<{ name: string; count: number }[]>([])
  const [catalogTypeCounts, setCatalogTypeCounts] = useState<Record<string, number>>({})
  const [changeTypeCounts, setChangeTypeCounts] = useState<Record<string, number>>({})
  const [warning, setWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [photoStatus, setPhotoStatus] = useState<{
    needOptimize: number
    offered: number
    optimized: number
    queue: { pending: number; running: number }
  } | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoMsg, setPhotoMsg] = useState<string | null>(null)

  // Bewaar progressie lokaal (filters/tab/pagina/scroll) — geen Next-router.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          tab,
          filters,
          page,
          scroll: listScrollRef.current,
        })
      )
    } catch {
      /* private mode e.d. */
    }
  }, [tab, filters, page])

  // Debounce zoekveld
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => {
        if (f.q === draftQ) return f
        return { ...f, q: draftQ }
      })
      if (draftQ !== filters.q) setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [draftQ, filters.q])

  const load = useCallback(async () => {
    setLoading(true)
    setWarning(null)
    try {
      const params = new URLSearchParams({
        tab,
        page: String(page),
        q: filters.q,
        type: filters.type,
        location: filters.location,
        stock: filters.stock,
        photo: filters.photo,
        offered: filters.offered,
        price: filters.price,
        height: filters.height,
        brand: filters.brand,
        plantsoort: filters.plantsoort,
        optimized: filters.optimized,
      })
      const res = await fetch(`/api/admin/catalog?${params}`)
      const data = await res.json()
      if (!res.ok && data.error) {
        setMsg(data.error)
        setItems([])
        return
      }
      if (data.warning) setWarning(data.warning)
      if (data.error && !data.ok) setMsg(data.error)
      setItems(data.items || [])
      setTotal(data.total ?? 0)
      setPageSize(data.pageSize ?? 40)
      if (typeof data.openChanges === 'number') setOpenChanges(data.openChanges)
      if (typeof data.offeredTotal === 'number') setOfferedTotal(data.offeredTotal)
      if (data.brands) setBrands(data.brands)
      if (data.plantsoorten) setPlantsoorten(data.plantsoorten)
      if (data.catalogTypeCounts) setCatalogTypeCounts(data.catalogTypeCounts)
      else if (data.typeCounts && tab !== 'new') setCatalogTypeCounts(data.typeCounts)
      if (data.changeTypeCounts) setChangeTypeCounts(data.changeTypeCounts)
      setSelected(new Set())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Laden mislukt')
    } finally {
      setLoading(false)
      // Eén keer scroll herstellen na heropenen met opgeslagen state
      if (restoreScrollOnce.current && listScrollRef.current > 0) {
        restoreScrollOnce.current = false
        requestAnimationFrame(() => window.scrollTo(0, listScrollRef.current))
      }
    }
  }, [tab, page, filters])

  useEffect(() => {
    void load()
  }, [load])

  const refreshPhotoStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/photos/optimize')
      const data = await res.json()
      if (data.ok) {
        setPhotoStatus({
          needOptimize: data.needOptimize ?? 0,
          offered: data.offered ?? 0,
          optimized: data.optimized ?? 0,
          queue: data.queue ?? { pending: 0, running: 0 },
        })
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refreshPhotoStatus()
  }, [refreshPhotoStatus, offeredTotal])

  async function enqueuePhotoOptimize() {
    setPhotoBusy(true)
    setPhotoMsg(null)
    try {
      const res = await fetch('/api/admin/photos/optimize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      })
      const data = await res.json()
      if (!data.ok && data.error) {
        setPhotoMsg(data.error)
        return
      }
      setPhotoMsg(data.message || `${data.enqueued} in wachtrij`)
      await refreshPhotoStatus()
      // Automatisch eerste jobs verwerken (één voor één)
      if (data.enqueued > 0) {
        void processPhotoQueue()
      }
    } catch (e) {
      setPhotoMsg(e instanceof Error ? e.message : 'Enqueue mislukt')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function processPhotoQueue() {
    setPhotoBusy(true)
    setPhotoMsg('Bezig met studio + detail + maat… (dit kan 30–90s per product duren)')
    try {
      let safety = 0
      while (safety < 50) {
        safety++
        const res = await fetch('/api/admin/photos/optimize/run', { method: 'POST' })
        const data = await res.json()
        if (data.message && data.done === false && !data.itemcode) {
          setPhotoMsg(data.message)
          break
        }
        if (!res.ok || data.error) {
          setPhotoMsg(
            `Fout bij ${data.itemcode || '?'}: ${data.error || 'onbekend'}` +
              (data.remaining ? ` · nog ${data.remaining} in wachtrij` : '')
          )
          // ga door met volgende
          if (!data.remaining) break
          continue
        }
        setPhotoMsg(
          `${data.itemcode}: fotoset klaar` +
            (data.remaining ? ` · nog ${data.remaining} in wachtrij…` : ' · klaar')
        )
        if (!data.remaining) break
      }
      await refreshPhotoStatus()
      void load()
    } catch (e) {
      setPhotoMsg(e instanceof Error ? e.message : 'Verwerken mislukt')
    } finally {
      setPhotoBusy(false)
    }
  }

  // Onthoud scroll terwijl je door de lijst gaat
  useEffect(() => {
    function onScroll() {
      listScrollRef.current = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => {
      const next = { ...f, [key]: value }
      // Type zonder standplaats → locatiefilter resetten
      if (key === 'type' && value && !locationAppliesToType(String(value))) {
        next.location = ''
      }
      return next
    })
    setPage(1)
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setDraftQ('')
    setPage(1)
  }

  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([k, v]) => k !== 'q' && !!v).length + (filters.q ? 1 : 0)
  }, [filters])

  function changeTab(t: Tab) {
    setTab(t)
    setPage(1)
    // Tab "Aangeboden" filtert al op offered — dropdown niet dubbel zetten
    if (t === 'offered') setFilters((f) => ({ ...f, offered: '' }))
  }

  /** Popup openen — geen route-wijziging, filters blijven in state. */
  function openDetail(itemcode: string) {
    listScrollRef.current = window.scrollY
    try {
      sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({ tab, filters, page, scroll: listScrollRef.current })
      )
    } catch {
      /* ignore */
    }
    setDetailCode(itemcode)
  }

  function closeDetail() {
    setDetailCode(null)
    requestAnimationFrame(() => window.scrollTo(0, listScrollRef.current))
  }

  function onOfferedFromDrawer(itemcode: string, offered: boolean) {
    setItems((list) =>
      list.map((it) => (it.itemcode === itemcode ? { ...it, offered } : it))
    )
    setOfferedTotal((n) => n + (offered ? 1 : -1))
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
        ? [...selected].filter((id) => !id.includes('-') || items.some((i) => i.itemcode === id))
        : items.map((it) => it.itemcode).filter(Boolean)
    // selected kan changeIds zijn op tab new — map naar itemcodes
    const itemcodes =
      tab === 'new'
        ? items
            .filter((it) => selected.size === 0 || selected.has(String(it.changeId)))
            .map((it) => it.itemcode)
        : selected.size > 0
          ? items.filter((it) => selected.has(it.itemcode)).map((it) => it.itemcode)
          : items.map((it) => it.itemcode)

    const list = itemcodes.length ? itemcodes : codes
    if (!list.length) return
    startTransition(async () => {
      const res = await setItemsOfferedBulk(list, next)
      if (!res.ok) setMsg(res.error)
      else {
        setMsg(`${list.length} items ${next ? 'aangeboden' : 'uitgezet'}.`)
        void load()
      }
    })
  }

  function ackSelected() {
    const ids = items
      .filter((it) => it.changeId && (selected.size === 0 || selected.has(String(it.changeId))))
      .map((it) => it.changeId!)
    if (!ids.length) return
    startTransition(async () => {
      const res = await acknowledgeChanges(ids)
      if (!res.ok) setMsg(res.error)
      else {
        setMsg(`${ids.length} wijzigingen gemarkeerd als bekeken.`)
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
          `Sync klaar — ${data.pushed} actief gepusht` +
            (data.deactivated || data.removed
              ? `, ${data.deactivated ?? data.removed} op non-actief (draft, niet verwijderd)`
              : '') +
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
  const showPlantsoort = !filters.type || filters.type === 'planten' || filters.type === 'combinaties'
  const showBrand =
    !filters.type ||
    filters.type === 'potten' ||
    filters.type === 'combinaties' ||
    filters.type === 'accessoires'
  // Locatie-filter alleen tonen als type het toelaat (of type = alles)
  const showLocationFilter =
    !filters.type || locationAppliesToType(filters.type)

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectClass =
    'w-full rounded-lg border border-stera-line bg-white p-2.5 text-sm text-stera-ink'

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <p className="stera-eyebrow mb-2">Admin · Webshop</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Catalogus</h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Filter eerst (type, locatie, stock, prijs…), bekijk specs, en kies wat je
            aanbiedt. Alleen de selectie gaat naar Shopify — bij 0 stock = op bestelling.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const badge =
              t.id === 'new' ? openChanges : t.id === 'offered' ? offeredTotal : null
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

        {isNew && Object.keys(changeTypeCounts).length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-stera-ink-soft">
            {Object.entries(changeTypeCounts).map(([k, n]) => (
              <span key={k} className="rounded-full border border-stera-line bg-white px-2 py-1">
                {CHANGE_LABEL[k] || k}: <strong className="text-stera-ink">{n}</strong>
              </span>
            ))}
          </div>
        ) : null}

        {!isNew && Object.keys(catalogTypeCounts).length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {CATALOG_TYPES.filter((t) => t.id).map((t) => {
              const n = catalogTypeCounts[t.id] ?? 0
              if (!n) return null
              const active = filters.type === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter('type', active ? '' : t.id)}
                  className={`rounded-full border px-2.5 py-1 transition ${
                    active
                      ? 'border-stera-green bg-stera-green text-white'
                      : 'border-stera-line bg-white text-stera-ink-soft hover:border-stera-green/40'
                  }`}
                >
                  {t.label} <strong className={active ? '' : 'text-stera-ink'}>{n}</strong>
                </button>
              )
            })}
          </div>
        ) : null}

        {/* Filters */}
        <div className="stera-card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className="text-sm font-semibold text-stera-ink"
            >
              Filters {activeFilterCount > 0 ? `(${activeFilterCount} actief)` : ''}{' '}
              <span className="text-stera-ink-soft">{filtersOpen ? '▲' : '▼'}</span>
            </button>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-stera-green underline-offset-2 hover:underline"
              >
                Filters wissen
              </button>
            ) : null}
          </div>

          <input
            type="search"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Zoek op naam, itemcode, variety…"
            className={selectClass}
          />

          {filtersOpen && !isNew ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <select
                value={filters.type}
                onChange={(e) => setFilter('type', e.target.value)}
                className={selectClass}
              >
                {CATALOG_TYPES.map((o) => (
                  <option key={o.id || 'all'} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>

              {showLocationFilter ? (
                <select
                  value={filters.location}
                  onChange={(e) => setFilter('location', e.target.value)}
                  className={selectClass}
                >
                  {LOCATION_FILTER_OPTIONS.map((o) => (
                    <option key={o.id || 'all'} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center rounded-lg border border-dashed border-stera-line bg-white/50 px-3 text-xs text-stera-ink-soft">
                  Locatie n.v.t. voor dit type
                </div>
              )}

              <select
                value={filters.stock}
                onChange={(e) => setFilter('stock', e.target.value)}
                className={selectClass}
              >
                {STOCK_OPTIONS.map((o) => (
                  <option key={o.id || 'all'} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>

              <select
                value={filters.photo}
                onChange={(e) => setFilter('photo', e.target.value)}
                className={selectClass}
              >
                {PHOTO_OPTIONS.map((o) => (
                  <option key={o.id || 'all'} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>

              <select
                value={filters.optimized}
                onChange={(e) => setFilter('optimized', e.target.value)}
                className={selectClass}
              >
                {OPTIMIZED_OPTIONS.map((o) => (
                  <option key={o.id || 'all'} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>

              <select
                value={filters.offered}
                onChange={(e) => setFilter('offered', e.target.value)}
                className={selectClass}
                disabled={tab === 'offered'}
              >
                {OFFERED_OPTIONS.map((o) => (
                  <option key={o.id || 'all'} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>

              <select
                value={filters.price}
                onChange={(e) => setFilter('price', e.target.value)}
                className={selectClass}
              >
                {PRICE_BANDS.map((o) => (
                  <option key={o.id || 'all'} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>

              <select
                value={filters.height}
                onChange={(e) => setFilter('height', e.target.value)}
                className={selectClass}
              >
                {HEIGHT_BANDS.map((o) => (
                  <option key={o.id || 'all'} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>

              {showBrand ? (
                <select
                  value={filters.brand}
                  onChange={(e) => setFilter('brand', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Merk: alles</option>
                  {brands.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} ({b.count})
                    </option>
                  ))}
                </select>
              ) : null}

              {showPlantsoort ? (
                <select
                  value={filters.plantsoort}
                  onChange={(e) => setFilter('plantsoort', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Plantsoort: alles</option>
                  {plantsoorten.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.count})
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-stera-ink-soft">
              {loading ? (
                'Laden…'
              ) : (
                <>
                  <strong className="text-stera-ink">{total.toLocaleString('nl-BE')}</strong>{' '}
                  resultaten · pagina {page}/{totalPages}
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
              Aangeboden ({offeredTotal}) → actief in Shopify. Uitgezet → draft
              (foto&apos;s blijven bewaard). 0-stock = op bestelling.
            </span>
          </div>

          {/* Foto-pipeline: aangeboden + niet afgewerkt */}
          <div className="space-y-2 rounded-xl border border-stera-green/25 bg-stera-green/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Foto-optimalisatie (studio + detail + maat)
            </p>
            <p className="text-xs text-stera-ink-soft">
              Voor <strong className="text-stera-ink">aangeboden</strong> producten die nog{' '}
              <strong className="text-stera-ink">niet afgewerkt</strong> zijn: Grok studiofoto,
              detailclose-up en maatfoto — zoals de eerdere combinatie-pipeline. Thumbnail
              wordt de studiofoto; origineel blijft bewaard.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-stera-ink-soft">
              {photoStatus ? (
                <>
                  <span>
                    Te doen:{' '}
                    <strong className="text-stera-ink">{photoStatus.needOptimize}</strong>
                    {' / '}
                    {photoStatus.offered} aangeboden
                  </span>
                  <span>·</span>
                  <span>
                    Afgewerkt: <strong className="text-stera-ink">{photoStatus.optimized}</strong>
                  </span>
                  {(photoStatus.queue.pending > 0 || photoStatus.queue.running > 0) && (
                    <>
                      <span>·</span>
                      <span>
                        Queue: {photoStatus.queue.pending} wacht, {photoStatus.queue.running}{' '}
                        bezig
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span>Status laden…</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={enqueuePhotoOptimize}
                disabled={photoBusy || (photoStatus?.needOptimize ?? 0) === 0}
                className="stera-cta stera-cta-primary text-sm disabled:opacity-50"
              >
                {photoBusy
                  ? 'Bezig…'
                  : `Optimaliseer openstaande (${photoStatus?.needOptimize ?? '…'})`}
              </button>
              <button
                type="button"
                onClick={() => void processPhotoQueue()}
                disabled={photoBusy || (photoStatus?.queue.pending ?? 0) === 0}
                className="stera-cta stera-cta-secondary text-sm disabled:opacity-50"
              >
                Verwerk wachtrij
              </button>
              <button
                type="button"
                onClick={() => void refreshPhotoStatus()}
                disabled={photoBusy}
                className="text-xs text-stera-green underline-offset-2 hover:underline disabled:opacity-50"
              >
                Status vernieuwen
              </button>
            </div>
            {photoMsg ? <p className="text-xs text-stera-ink-soft">{photoMsg}</p> : null}
          </div>

          {warning ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {warning}
            </p>
          ) : null}
          {msg ? <p className="text-xs text-stera-ink-soft">{msg}</p> : null}
        </div>

        {/* List — klik op rij opent detail-drawer (filters/pagina blijven staan) */}
        <ul className="space-y-2">
          {items.map((it) => {
            const key = isNew ? String(it.changeId) : it.itemcode
            const selId = isNew ? String(it.changeId) : it.itemcode
            const on = !!it.offered
            const active = detailCode === it.itemcode
            return (
              <li
                key={key}
                className={`rounded-xl border bg-white transition ${
                  active
                    ? 'border-stera-green ring-1 ring-stera-green/30'
                    : on
                      ? 'border-stera-green/40'
                      : 'border-stera-line'
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(selId)}
                    onChange={() => toggleSelect(selId)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                    aria-label="Selecteer"
                  />
                  <button
                    type="button"
                    onClick={() => openDetail(it.itemcode)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {it.imageItemcode || it.hasStudioImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={catalogThumbUrl(it.itemcode, !!it.hasStudioImage)}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg object-cover bg-white"
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
                        {it.catalogType ? (
                          <span className="shrink-0 rounded-full border border-stera-line px-2 py-0.5 text-[10px] text-stera-ink-soft">
                            {TYPE_LABEL[it.catalogType] || it.catalogType}
                          </span>
                        ) : null}
                        {it.optimized ? (
                          <span className="shrink-0 rounded-full bg-stera-green/15 px-2 py-0.5 text-[10px] font-semibold text-stera-green">
                            Afgewerkt
                          </span>
                        ) : null}
                        {it.hasStudioImage ? (
                          <span className="shrink-0 rounded-full border border-stera-green/30 px-2 py-0.5 text-[10px] text-stera-green">
                            Studio
                          </span>
                        ) : null}
                        {it.stock != null && it.stock <= 0 ? (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Op bestelling
                          </span>
                        ) : null}
                        {it.locationRelevant !== false &&
                        locationAppliesToType(it.catalogType) ? (
                          Array.isArray(it.locations) && it.locations.length > 0 ? (
                            <span className="shrink-0 rounded-full border border-stera-line px-2 py-0.5 text-[10px] text-stera-ink-soft">
                              {it.locations.join(' + ')}
                              {it.locationSource === 'manual' ? ' · manueel' : ''}
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              Locatie?
                            </span>
                          )
                        ) : null}
                      </div>
                      <p className="text-xs text-stera-ink-soft">
                        {[it.mainGroup, it.productGroup, it.brand?.split('|')[0], it.plantsoort]
                          .filter(Boolean)
                          .join(' · ')}
                        {it.summary ? ` · ${it.summary}` : ''}
                      </p>
                      <p className="text-xs text-stera-ink-soft">
                        <span className="font-mono">{it.itemcode}</span>
                        {specsLine(it) ? ` · ${specsLine(it)}` : ''}
                        {it.costPrice != null ? ` · inkoop ${euro(it.costPrice)}` : ''}
                        {it.stock != null && !isNew ? ` · stock ${it.stock}` : ''}
                        <span className="ml-1 text-stera-green">· detail →</span>
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleOffer(it.itemcode, !on)
                    }}
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
              </li>
            )
          })}
        </ul>

        {detailCode ? (
          <CatalogDetailDrawer
            itemcode={detailCode}
            onClose={closeDetail}
            onOfferedChange={onOfferedFromDrawer}
          />
        ) : null}

        {!loading && items.length === 0 ? (
          <p className="text-center text-sm text-stera-ink-soft">
            {isNew
              ? 'Geen open wijzigingen. Na de ochtend-scan verschijnen hier delta’s.'
              : 'Geen producten voor deze filter. Probeer filters te verbreden.'}
          </p>
        ) : null}

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

      </div>
    </main>
  )
}
