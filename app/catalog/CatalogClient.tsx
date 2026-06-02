'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { CatalogItem } from '@/lib/catalog-items'

/**
 * Volledig client-side catalogus: alle combinaties worden één keer
 * ingeladen (compacte metadata) en daarna instant gefilterd/gepagineerd
 * in de browser — geen serverronde per filter. De actieve filters worden
 * in de URL bijgehouden via history.replaceState (geen herlaadbeurt), zodat
 * delen en terugkeren (scrollpositie) blijven werken.
 */

export type { CatalogItem }

export type CatalogInitial = {
  tab: 'combinaties' | 'moswanden'
  q: string
  inStock: boolean
  height: string
  diameter: string
  substraten: string[]
  locaties: string[]
  lichten: string[]
  systems: string[]
  shapes: string[]
  plantsoorten: string[]
  merken: string[]
  collecties: string[]
  frames: string[]
  mostypes: string[]
  moskleuren: string[]
}

const PAGE_SIZE = 48

const HEIGHT_BUCKETS: Record<string, { min?: number; max?: number; label: string }> = {
  '0-50': { max: 50, label: 'Tot 50 cm' },
  '50-100': { min: 50, max: 100, label: '50 – 100 cm' },
  '100-150': { min: 100, max: 150, label: '100 – 150 cm' },
  '150-200': { min: 150, max: 200, label: '150 – 200 cm' },
  '200+': { min: 200, label: '200 cm en hoger' },
}

const LIGHT_LABELS: Record<string, string> = {
  '500': 'Weinig licht (500 lux)',
  '750': 'Halfschaduw (750 lux)',
  '1000': 'Veel licht (1000 lux)',
  '1500': 'Vol zon (1500 lux)',
}
function lightLabel(lux: number | string): string {
  const s = String(lux)
  return LIGHT_LABELS[s] ?? `${s} lux`
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n)
}

function toggle(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

function ShapeIcon({ name }: { name: 'Rond' | 'Hoekig' | 'Overig' }) {
  const p = {
    width: 24,
    height: 24,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (name === 'Rond') return (<svg {...p}><circle cx="16" cy="16" r="10" /></svg>)
  if (name === 'Hoekig') return (<svg {...p}><rect x="6" y="6" width="20" height="20" rx="1.5" /></svg>)
  return (<svg {...p}><circle cx="9" cy="17" r="2" /><circle cx="16" cy="17" r="2" /><circle cx="23" cy="17" r="2" /></svg>)
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-stera-ink/10 pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-ink/60">{title}</p>
      {children}
    </div>
  )
}

function countBy(items: CatalogItem[], key: (i: CatalogItem) => string): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) {
    const k = key(it)
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export default function CatalogClient({
  items,
  initial,
  onSelect,
}: {
  items: CatalogItem[]
  initial: CatalogInitial
  /** Indien gezet: kaarten worden "kies"-knoppen i.p.v. links naar de
   *  detailpagina (gebruikt als kies-venster in de offerte-builder). */
  onSelect?: (item: CatalogItem) => void
}) {
  const [tab, setTab] = useState(initial.tab)
  const [q, setQ] = useState(initial.q)
  const [inStock, setInStock] = useState(initial.inStock)
  const [height, setHeight] = useState(initial.height)
  const [diameter, setDiameter] = useState(initial.diameter)
  const [substraten, setSubstraten] = useState<string[]>(initial.substraten)
  const [locaties, setLocaties] = useState<string[]>(initial.locaties)
  const [lichten, setLichten] = useState<string[]>(initial.lichten)
  const [systems, setSystems] = useState<string[]>(initial.systems)
  const [shapes, setShapes] = useState<string[]>(initial.shapes)
  const [plantsoorten, setPlantsoorten] = useState<string[]>(initial.plantsoorten)
  const [merken, setMerken] = useState<string[]>(initial.merken)
  const [collecties, setCollecties] = useState<string[]>(initial.collecties)
  const [frames, setFrames] = useState<string[]>(initial.frames)
  const [mostypes, setMostypes] = useState<string[]>(initial.mostypes)
  const [moskleuren, setMoskleuren] = useState<string[]>(initial.moskleuren)
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const combinaties = useMemo(() => items.filter((x) => !x.isMos), [items])
  const moswanden = useMemo(() => items.filter((x) => x.isMos), [items])
  const tabSet = tab === 'moswanden' ? moswanden : combinaties

  // Facet-tellingen (op de volledige tab-set).
  const plantsoortCounts = useMemo(() => countBy(combinaties, (x) => x.plantsoort), [combinaties])
  const merkCounts = useMemo(() => countBy(combinaties, (x) => x.merk), [combinaties])
  const collectieCounts = useMemo(() => countBy(combinaties, (x) => x.collection ?? ''), [combinaties])
  const systeemCounts = useMemo(() => countBy(combinaties, (x) => x.itemVariety ?? ''), [combinaties])
  const shapeCounts = useMemo(() => countBy(combinaties, (x) => x.shape), [combinaties])
  const substraatCounts = useMemo(() => countBy(combinaties, (x) => x.substrate ?? ''), [combinaties])
  const lichtCounts = useMemo(() => countBy(combinaties, (x) => (x.lightLux != null ? String(x.lightLux) : '')), [combinaties])
  const locatieCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of combinaties) for (const l of x.locations) m.set(l, (m.get(l) ?? 0) + 1)
    return m
  }, [combinaties])
  const frameCounts = useMemo(() => countBy(moswanden, (x) => x.frameMateriaal), [moswanden])
  const mostypeCounts = useMemo(() => countBy(moswanden, (x) => x.mostype), [moswanden])
  const moskleurCounts = useMemo(() => countBy(moswanden, (x) => x.moskleur), [moswanden])

  const allDiameters = useMemo(
    () =>
      Array.from(new Set(combinaties.map((x) => Math.round(Number(x.diameter))).filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b),
    [combinaties]
  )

  // Gefilterde lijst.
  const filtered = useMemo(() => {
    const bucket = HEIGHT_BUCKETS[height] ?? null
    let f = tabSet
    if (q.trim()) {
      const ql = q.trim().toLowerCase()
      f = f.filter((x) => (x.description || '').toLowerCase().includes(ql))
    }
    if (bucket?.min != null) f = f.filter((x) => (x.height ?? 0) >= (bucket.min ?? 0))
    if (bucket?.max != null) f = f.filter((x) => (x.height ?? 0) <= (bucket.max ?? 0))
    if (inStock) f = f.filter((x) => (x.stockAvailable ?? 0) > 0)
    if (tab === 'combinaties') {
      if (substraten.length) f = f.filter((x) => x.substrate != null && substraten.includes(x.substrate))
      if (locaties.length) f = f.filter((x) => locaties.some((l) => x.locations.includes(l)))
      if (lichten.length) f = f.filter((x) => x.lightLux != null && lichten.includes(String(x.lightLux)))
      if (diameter) f = f.filter((x) => Math.round(Number(x.diameter)) === Number(diameter))
      if (systems.length) f = f.filter((x) => systems.includes(x.itemVariety ?? ''))
      if (shapes.length) f = f.filter((x) => shapes.includes(x.shape))
      if (plantsoorten.length) f = f.filter((x) => plantsoorten.includes(x.plantsoort))
      if (merken.length) f = f.filter((x) => merken.includes(x.merk))
      if (collecties.length)
        f = f.filter((x) => x.collection != null && collecties.includes(x.collection))
    } else {
      if (frames.length) f = f.filter((x) => frames.includes(x.frameMateriaal))
      if (mostypes.length) f = f.filter((x) => mostypes.includes(x.mostype))
      if (moskleuren.length) f = f.filter((x) => moskleuren.includes(x.moskleur))
    }
    return f
  }, [tabSet, tab, q, height, inStock, substraten, locaties, lichten, diameter, systems, shapes, plantsoorten, merken, collecties, frames, mostypes, moskleuren])

  const totalCount = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Reset naar pagina 1 zodra een filter wijzigt.
  useEffect(() => {
    setPage(1)
  }, [tab, q, height, inStock, substraten, locaties, lichten, diameter, systems, shapes, plantsoorten, merken, collecties, frames, mostypes, moskleuren])

  // Filters in de URL bijhouden (zonder herladen) — voor delen + terugkeer.
  const firstSync = useRef(true)
  useEffect(() => {
    const usp = new URLSearchParams()
    if (tab !== 'combinaties') usp.set('tab', tab)
    if (q.trim()) usp.set('q', q.trim())
    if (inStock) usp.set('inStock', '1')
    else usp.set('inStock', '0')
    if (height) usp.set('height', height)
    if (tab === 'combinaties') {
      if (diameter) usp.set('diameter', diameter)
      for (const s of substraten) usp.append('substraat', s)
      for (const s of locaties) usp.append('locatie', s)
      for (const s of lichten) usp.append('licht', s)
      for (const s of systems) usp.append('system', s)
      for (const s of shapes) usp.append('shape', s)
      for (const s of plantsoorten) usp.append('plantsoort', s)
      for (const s of merken) usp.append('merk', s)
      for (const s of collecties) usp.append('collectie', s)
    } else {
      for (const s of frames) usp.append('frame', s)
      for (const s of mostypes) usp.append('mostype', s)
      for (const s of moskleuren) usp.append('moskleur', s)
    }
    if (safePage > 1) usp.set('page', String(safePage))
    const qs = usp.toString()
    const url = '/catalog' + (qs ? `?${qs}` : '')
    // Eerste render niet pushen (voorkomt dubbele history-entry).
    window.history.replaceState(window.history.state, '', url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, inStock, height, diameter, substraten, locaties, lichten, systems, shapes, plantsoorten, merken, collecties, frames, mostypes, moskleuren, safePage])

  function clearAll() {
    setQ('')
    setInStock(true)
    setHeight('')
    setDiameter('')
    setSubstraten([])
    setLocaties([])
    setLichten([])
    setSystems([])
    setShapes([])
    setPlantsoorten([])
    setMerken([])
    setCollecties([])
    setFrames([])
    setMostypes([])
    setMoskleuren([])
  }

  const sortedPlantsoorten = useMemo(
    () => Array.from(plantsoortCounts.entries()).filter(([k]) => k && k.toLowerCase() !== 'overig').sort((a, b) => b[1] - a[1]),
    [plantsoortCounts]
  )
  const sortedMerken = useMemo(() => Array.from(merkCounts.entries()).filter(([k]) => k).sort((a, b) => b[1] - a[1]), [merkCounts])
  const sortedCollecties = useMemo(() => Array.from(collectieCounts.entries()).filter(([k]) => k).sort((a, b) => b[1] - a[1]), [collectieCounts])
  const sortedSystemen = useMemo(() => Array.from(systeemCounts.entries()).filter(([k]) => k).sort((a, b) => b[1] - a[1]), [systeemCounts])
  const sortedSubstraten = useMemo(() => Array.from(substraatCounts.entries()).filter(([k]) => k).sort((a, b) => b[1] - a[1]), [substraatCounts])
  const sortedLichten = useMemo(() => Array.from(lichtCounts.entries()).filter(([k]) => k).sort((a, b) => Number(a[0]) - Number(b[0])), [lichtCounts])
  const sortedFrames = useMemo(() => Array.from(frameCounts.entries()).filter(([k]) => k && k !== 'Overig').sort((a, b) => b[1] - a[1]), [frameCounts])
  const sortedMostypes = useMemo(() => Array.from(mostypeCounts.entries()).filter(([k]) => k && k !== 'Overig').sort((a, b) => b[1] - a[1]), [mostypeCounts])
  const sortedMoskleuren = useMemo(() => Array.from(moskleurCounts.entries()).filter(([k]) => k).sort((a, b) => b[1] - a[1]), [moskleurCounts])

  const SHAPES: Array<'Rond' | 'Hoekig' | 'Overig'> = ['Rond', 'Hoekig', 'Overig']

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-4">
        <h1 className="text-3xl font-serif text-stera-ink">Webshop</h1>
        <p className="mt-1 text-sm text-stera-ink/70">
          {tab === 'combinaties'
            ? 'All-in-1 combinaties — plant in pot, voorgekweekt en met watermeter, klaar om af te leveren.'
            : 'Mosmuren — onderhoudsvrije wanddecoratie in aluminium, MDF of Nova-frames.'}
        </p>
      </header>

      {/* Tabs */}
      <nav className="mb-6 flex gap-1 border-b border-stera-ink/15">
        {(['combinaties', 'moswanden'] as const).map((t) => {
          const active = t === tab
          const label = t === 'combinaties' ? 'Combinaties' : 'Moswanden'
          const cnt = t === 'combinaties' ? combinaties.length : moswanden.length
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                active ? 'border-stera-green text-stera-green' : 'border-transparent text-stera-ink/60 hover:text-stera-ink'
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs text-stera-ink/40">({cnt.toLocaleString('nl-BE')})</span>
            </button>
          )
        })}
      </nav>

      {/* Pot-vorm (combinaties) / Mostype (moswanden) — chips bovenaan */}
      {tab === 'combinaties' ? (
        <section className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-ink/60">Pot-vorm</p>
          <div className="flex flex-wrap gap-2">
            {SHAPES.map((shape) => {
              const checked = shapes.includes(shape)
              return (
                <button
                  key={shape}
                  type="button"
                  onClick={() => setShapes((p) => toggle(p, shape))}
                  className={`flex min-w-[88px] items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                    checked ? 'border-stera-green bg-stera-green/10 text-stera-green' : 'border-stera-ink/20 bg-white text-stera-ink hover:border-stera-green'
                  }`}
                >
                  <span className="shrink-0 text-stera-green"><ShapeIcon name={shape} /></span>
                  <span className="flex-1 truncate text-sm font-medium">{shape}</span>
                  <span className="text-xs text-stera-ink/50">({shapeCounts.get(shape) ?? 0})</span>
                </button>
              )
            })}
          </div>
        </section>
      ) : (
        <section className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-ink/60">Mostype</p>
          <div className="flex flex-wrap gap-2">
            {(['Bolmos', 'Platmos', 'Rendiermos', 'Mix'] as const).map((mt) => {
              const checked = mostypes.includes(mt)
              return (
                <button
                  key={mt}
                  type="button"
                  onClick={() => setMostypes((p) => toggle(p, mt))}
                  className={`flex min-w-[88px] items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                    checked ? 'border-stera-green bg-stera-green/10 text-stera-green' : 'border-stera-ink/20 bg-white text-stera-ink hover:border-stera-green'
                  }`}
                >
                  <span className="flex-1 text-sm font-medium">{mt}</span>
                  <span className="text-xs text-stera-ink/50">({mostypeCounts.get(mt) ?? 0})</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Filters: vaste zijbalk op desktop, zijpaneel (drawer) op mobiel */}
        <aside
          className={`${
            filtersOpen
              ? 'fixed inset-0 z-50 overflow-y-auto bg-stera-cream p-4'
              : 'hidden'
          } lg:sticky lg:top-4 lg:z-auto lg:block lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:bg-transparent lg:p-0`}
        >
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <span className="text-base font-semibold text-stera-ink">Filters</span>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-stera-ink/60 hover:bg-white"
            >
              Sluiten ✕
            </button>
          </div>
            <div className="space-y-5">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Zoek op naam..."
                className="w-full rounded-lg border border-stera-ink/20 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stera-ink/30"
              />

              <label className="flex items-center gap-2 rounded-lg border border-stera-ink/20 bg-white px-3 py-2 text-sm font-medium text-stera-ink">
                <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="h-4 w-4 accent-stera-green" />
                Op voorraad
              </label>

              {tab === 'combinaties' ? (
                <FilterSection title="Substraat">
                  <ul className="space-y-1.5">
                    {sortedSubstraten.map(([name, cnt]) => (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={substraten.includes(name)} onChange={() => setSubstraten((p) => toggle(p, name))} className="h-4 w-4 accent-stera-green" />
                            {name}
                          </span>
                          <span className="text-xs text-stera-ink/50">({cnt})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </FilterSection>
              ) : null}

              {tab === 'combinaties' ? (
                <FilterSection title="Binnen / buiten">
                  <ul className="space-y-1.5">
                    {(['Binnen', 'Buiten'] as const).map((loc) => (
                      <li key={loc}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={locaties.includes(loc)} onChange={() => setLocaties((p) => toggle(p, loc))} className="h-4 w-4 accent-stera-green" />
                            {loc}
                          </span>
                          <span className="text-xs text-stera-ink/50">({locatieCounts.get(loc) ?? 0})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </FilterSection>
              ) : null}

              {tab === 'combinaties' ? (
                <FilterSection title="Lichtbehoefte">
                  <ul className="space-y-1.5">
                    {sortedLichten.map(([lux, cnt]) => (
                      <li key={lux}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={lichten.includes(lux)} onChange={() => setLichten((p) => toggle(p, lux))} className="h-4 w-4 accent-stera-green" />
                            {lightLabel(lux)}
                          </span>
                          <span className="text-xs text-stera-ink/50">({cnt})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </FilterSection>
              ) : null}

              <FilterSection title="Hoogte">
                <select value={height} onChange={(e) => setHeight(e.target.value)} className="w-full rounded-lg border border-stera-ink/20 bg-white px-3 py-2">
                  <option value="">Alle hoogtes</option>
                  {Object.entries(HEIGHT_BUCKETS).map(([key, b]) => (
                    <option key={key} value={key}>{b.label}</option>
                  ))}
                </select>
              </FilterSection>

              {tab === 'combinaties' ? (
                <FilterSection title="Diameter">
                  <select value={diameter} onChange={(e) => setDiameter(e.target.value)} className="w-full rounded-lg border border-stera-ink/20 bg-white px-3 py-2">
                    <option value="">Alle Ø</option>
                    {allDiameters.map((d) => (<option key={d} value={d}>Ø {d} cm</option>))}
                  </select>
                </FilterSection>
              ) : null}

              {tab === 'combinaties' ? (
                <FilterSection title="Beplantingssysteem">
                  <ul className="space-y-1.5">
                    {sortedSystemen.map(([name, cnt]) => (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={systems.includes(name)} onChange={() => setSystems((p) => toggle(p, name))} className="h-4 w-4 accent-stera-green" />
                            {name}
                          </span>
                          <span className="text-xs text-stera-ink/50">({cnt})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </FilterSection>
              ) : null}

              {tab === 'combinaties' ? (
                <FilterSection title="Plantsoort">
                  <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
                    {sortedPlantsoorten.map(([name, cnt]) => (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={plantsoorten.includes(name)} onChange={() => setPlantsoorten((p) => toggle(p, name))} className="h-4 w-4 accent-stera-green" />
                            {name}
                          </span>
                          <span className="text-xs text-stera-ink/50">({cnt})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </FilterSection>
              ) : null}

              {tab === 'combinaties' ? (
                <FilterSection title="Merk">
                  <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
                    {sortedMerken.map(([name, cnt]) => (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={merken.includes(name)} onChange={() => setMerken((p) => toggle(p, name))} className="h-4 w-4 accent-stera-green" />
                            {name}
                          </span>
                          <span className="text-xs text-stera-ink/50">({cnt})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </FilterSection>
              ) : null}

              {tab === 'combinaties' ? (
                <FilterSection title="Collectie / serie">
                  <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
                    {sortedCollecties.map(([name, cnt]) => (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={collecties.includes(name)} onChange={() => setCollecties((p) => toggle(p, name))} className="h-4 w-4 accent-stera-green" />
                            {name}
                          </span>
                          <span className="text-xs text-stera-ink/50">({cnt})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </FilterSection>
              ) : null}

              {tab === 'moswanden' ? (
                <FilterSection title="Frame-materiaal">
                  <ul className="space-y-1.5">
                    {sortedFrames.map(([name, cnt]) => (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={frames.includes(name)} onChange={() => setFrames((p) => toggle(p, name))} className="h-4 w-4 accent-stera-green" />
                            {name}
                          </span>
                          <span className="text-xs text-stera-ink/50">({cnt})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </FilterSection>
              ) : null}

              {tab === 'moswanden' ? (
                <FilterSection title="Moskleur">
                  <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
                    {sortedMoskleuren.map(([name, cnt]) => (
                      <li key={name}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-stera-ink hover:text-stera-green">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={moskleuren.includes(name)} onChange={() => setMoskleuren((p) => toggle(p, name))} className="h-4 w-4 accent-stera-green" />
                            {name}
                          </span>
                          <span className="text-xs text-stera-ink/50">({cnt})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </FilterSection>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={clearAll} className="rounded-lg border border-stera-ink/20 px-4 py-2 font-medium transition hover:bg-white">
                  Wis alles
                </button>
              </div>
            </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="mt-5 w-full rounded-lg bg-stera-ink px-4 py-2.5 font-medium text-white lg:hidden"
          >
            Toon {totalCount.toLocaleString('nl-BE')} resultaten
          </button>
        </aside>

        {/* Resultaten */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-stera-ink/70">{totalCount.toLocaleString('nl-BE')} resultaten</p>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="rounded-lg border border-stera-ink/20 bg-white px-3 py-1.5 text-sm font-medium text-stera-ink lg:hidden"
            >
              Filters
            </button>
          </div>

          {pageItems.length === 0 ? (
            <div className="rounded-xl border border-stera-ink/10 bg-white/40 py-16 text-center text-stera-ink/60">
              {tab === 'combinaties' ? 'Geen combinaties gevonden met deze filters.' : 'Geen moswanden gevonden met deze filters.'}
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {pageItems.map((p) => {
                const inner = (
                  <>
                    <div className="relative aspect-square border-b border-stera-ink/5 bg-stera-cream">
                      {p.hasImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/nieuwkoop/image/${p.itemcode}`} alt={p.description} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-3" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-stera-ink/30">Geen foto</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-tight text-stera-ink">{p.description || p.itemcode}</h3>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.lightLux != null ? <span className="rounded bg-stera-cream/60 px-1.5 py-0.5 text-[10px] text-stera-ink/70">☀ {p.lightLux} lux</span> : null}
                        {p.locations.length > 0 ? <span className="rounded bg-stera-cream/60 px-1.5 py-0.5 text-[10px] text-stera-ink/70">{p.locations.join(' / ')}</span> : null}
                        {p.substrate ? <span className="rounded bg-stera-cream/60 px-1.5 py-0.5 text-[10px] text-stera-ink/70">{p.substrate}</span> : null}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-stera-ink/10 pt-2">
                        <span className="font-semibold text-stera-ink">{formatPrice(p.salePrice)}</span>
                        {p.stockAvailable > 0 ? (
                          <span className="shrink-0 rounded-full bg-stera-green/10 px-2 py-0.5 text-[10px] font-medium text-stera-green">op voorraad</span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-stera-ink/5 px-2 py-0.5 text-[10px] text-stera-ink/50">op aanvraag</span>
                        )}
                      </div>
                      {onSelect ? (
                        <span className="mt-2 block rounded-lg bg-stera-green px-2 py-1.5 text-center text-xs font-medium text-white">
                          Kies deze
                        </span>
                      ) : null}
                    </div>
                  </>
                )
                return (
                  <li key={p.itemcode} className="overflow-hidden rounded-xl border border-stera-ink/10 bg-white transition hover:border-stera-green hover:shadow-md">
                    {onSelect ? (
                      <button
                        type="button"
                        onClick={() => onSelect(p)}
                        className="flex h-full w-full flex-col text-left"
                      >
                        {inner}
                      </button>
                    ) : (
                      <Link href={`/catalog/${p.itemcode}`} className="flex h-full flex-col">
                        {inner}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {totalPages > 1 ? (
            <nav className="mt-8 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                className={`rounded-lg border border-stera-ink/20 px-4 py-2 transition ${safePage <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-white'}`}
              >
                ← Vorige
              </button>
              <span className="text-sm text-stera-ink/70">Pagina {safePage.toLocaleString('nl-BE')} van {totalPages.toLocaleString('nl-BE')}</span>
              <button
                type="button"
                onClick={() => {
                  setPage(Math.min(totalPages, safePage + 1))
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                disabled={safePage >= totalPages}
                className={`rounded-lg border border-stera-ink/20 px-4 py-2 transition ${safePage >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-white'}`}
              >
                Volgende →
              </button>
            </nav>
          ) : null}
        </div>
      </div>
    </main>
  )
}
