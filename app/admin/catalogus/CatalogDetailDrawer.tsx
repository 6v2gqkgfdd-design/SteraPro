'use client'

import { useEffect, useState, useTransition } from 'react'
import { setItemOffered } from './actions'

export type DetailItem = {
  itemcode: string
  description: string
  detail?: string | null
  costPrice?: number | null
  salePrice?: number | null
  marginFactor?: number | null
  mainGroup?: string | null
  productGroup?: string | null
  group?: string | null
  variety?: string | null
  potSize?: string | null
  diameter?: number | null
  height?: number | null
  length?: number | null
  width?: number | null
  depth?: number | null
  weight?: number | null
  diameterCulturePot?: number | null
  heightCulturePot?: number | null
  imageItemcode?: string | null
  deliveryDays?: number | null
  activeAtSource?: boolean
  stock?: number
  offered?: boolean
  catalogType?: string | null
  locations?: string[]
  brands?: string[]
  collections?: string[]
  substrate?: string[]
  materials?: string[]
  shapes?: string[]
  light?: string[]
  temperature?: string[]
  itemStatus?: string | null
}

const euro = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? '—' : `€ ${Number(n).toFixed(2)}`

const cm = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) || Number(n) === 0
    ? '—'
    : `${Math.round(Number(n))} cm`

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-stera-line/50 py-1.5 last:border-0">
      <span className="shrink-0 text-stera-ink-soft">{label}</span>
      <span className="text-right text-stera-ink">{children}</span>
    </div>
  )
}

type Props = {
  itemcode: string
  onClose: () => void
  onOfferedChange?: (itemcode: string, offered: boolean) => void
}

export default function CatalogDetailDrawer({ itemcode, onClose, onOfferedChange }: Props) {
  const [item, setItem] = useState<DetailItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setItem(null)
    fetch(`/api/admin/catalog/${encodeURIComponent(itemcode)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error || 'Laden mislukt')
        if (!cancelled) setItem(data.item)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Laden mislukt')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [itemcode])

  // Escape sluit drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function toggleOffer() {
    if (!item) return
    const next = !item.offered
    setItem({ ...item, offered: next })
    onOfferedChange?.(item.itemcode, next)
    startTransition(async () => {
      const res = await setItemOffered(item.itemcode, next)
      if (!res.ok) {
        setItem({ ...item, offered: !next })
        onOfferedChange?.(item.itemcode, !next)
        setError(res.error)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-stera-ink/40 backdrop-blur-[2px]"
        aria-label="Sluiten"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-lg flex-col bg-stera-cream shadow-2xl animate-in slide-in-from-right">
        <header className="flex items-center gap-3 border-b border-stera-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stera-line bg-white px-3 py-1.5 text-sm font-medium text-stera-ink hover:border-stera-green/40"
          >
            ← Terug
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-stera-ink">
              {item?.description || itemcode}
            </p>
            <p className="font-mono text-xs text-stera-ink-soft">{itemcode}</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-stera-ink-soft">Laden…</p>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : item ? (
            <div className="space-y-5">
              <div className="flex gap-4">
                {item.imageItemcode ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/nieuwkoop/image/${encodeURIComponent(item.imageItemcode)}`}
                    alt=""
                    className="h-36 w-36 shrink-0 rounded-xl object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-xl border border-dashed border-stera-line text-xs text-stera-ink-soft">
                    geen foto
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <h2 className="text-lg font-semibold leading-snug text-stera-ink">
                    {item.description}
                  </h2>
                  {item.detail ? (
                    <p className="text-sm leading-relaxed text-stera-ink-soft">{item.detail}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {item.stock != null && item.stock <= 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Op bestelling
                      </span>
                    ) : (
                      <span className="rounded-full bg-stera-green/10 px-2 py-0.5 text-[10px] font-semibold text-stera-green">
                        Stock {item.stock}
                      </span>
                    )}
                    {!item.activeAtSource ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                        Verdwenen bij Nieuwkoop
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleOffer}
                disabled={pending}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                  item.offered
                    ? 'bg-stera-green text-white'
                    : 'border border-stera-line bg-white text-stera-ink'
                }`}
              >
                {item.offered ? '✓ Wordt aangeboden — klik om uit te zetten' : 'Aanbieden in webshop'}
              </button>

              <section className="stera-card !p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Prijzen & voorraad
                </h3>
                <Row label="Inkoop">{euro(item.costPrice)}</Row>
                <Row label="Advies verkoop (excl.)">{euro(item.salePrice)}</Row>
                <Row label="Margefactor">
                  {item.marginFactor != null ? `${Number(item.marginFactor).toFixed(2)}×` : '—'}
                </Row>
                <Row label="Voorraad">
                  {item.stock != null
                    ? item.stock > 0
                      ? item.stock
                      : '0 (op bestelling)'
                    : '—'}
                </Row>
                <Row label="Levertijd">
                  {item.deliveryDays != null ? `${item.deliveryDays} dagen` : '—'}
                </Row>
              </section>

              <section className="stera-card !p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Afmetingen
                </h3>
                <Row label="Hoogte">{cm(item.height)}</Row>
                <Row label="Diameter">{cm(item.diameter)}</Row>
                <Row label="L × B">
                  {item.length || item.width
                    ? `${cm(item.length)} × ${cm(item.width)}`
                    : '—'}
                </Row>
                <Row label="Potmaat">{item.potSize || '—'}</Row>
                <Row label="Cultuurpot Ø">{cm(item.diameterCulturePot)}</Row>
              </section>

              <section className="stera-card !p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Kenmerken
                </h3>
                <Row label="Hoofdgroep">{item.mainGroup || '—'}</Row>
                <Row label="Productgroep">{item.productGroup || '—'}</Row>
                <Row label="Groep">{item.group || '—'}</Row>
                <Row label="Variety">{item.variety || '—'}</Row>
                <Row label="Locatie">
                  {item.locations?.length ? item.locations.join(', ') : '—'}
                </Row>
                <Row label="Merk">{item.brands?.length ? item.brands.join(', ') : '—'}</Row>
                <Row label="Collectie">
                  {item.collections?.length ? item.collections.join(', ') : '—'}
                </Row>
                <Row label="Substraat">
                  {item.substrate?.length ? item.substrate.join(', ') : '—'}
                </Row>
                <Row label="Materiaal">
                  {item.materials?.length ? item.materials.join(', ') : '—'}
                </Row>
                <Row label="Vorm">{item.shapes?.length ? item.shapes.join(', ') : '—'}</Row>
                <Row label="Licht">{item.light?.length ? item.light.join(', ') : '—'}</Row>
                <Row label="Temperatuur">
                  {item.temperature?.length ? item.temperature.join(', ') : '—'}
                </Row>
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
