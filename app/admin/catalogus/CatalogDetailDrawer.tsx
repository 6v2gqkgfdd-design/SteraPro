'use client'

/**
 * Gecentreerde modal-popup voor productdetail.
 * Geen navigatie — parent houdt filters/pagina vast.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  setItemLocation,
  setItemMarginFactor,
  setItemOffered,
  setItemOptimized,
} from './actions'
import {
  locationAppliesToType,
  type LocationLabel,
  type LocationSource,
} from '@/lib/location'
import { ImageLightbox } from '@/components/image-lightbox'
import {
  originalImageApiUrl,
  productMediaUrl,
  studioImageApiUrl,
} from '@/lib/product-media'

/** Inline SVG-placeholder voor ontbrekende of kapotte productfoto’s. */
function mediaPlaceholder(label: string): string {
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#F2EDE0" width="100%" height="100%"/><text x="50%" y="50%" text-anchor="middle" fill="#9B9685" font-size="11" font-family="system-ui">${label}</text></svg>`
    )
  )
}

export type DetailItem = {
  itemcode: string
  description: string
  detail?: string | null
  costPrice?: number | null
  marginFactor?: number | null
  marginIsCustom?: boolean
  itemMarginFactor?: number | null
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
  locations?: LocationLabel[] | string[]
  locationSource?: LocationSource | string
  locationsNieuwkoop?: LocationLabel[] | string[]
  locationsManual?: LocationLabel[] | string[]
  enrichmentBinnen?: boolean | null
  enrichmentBuiten?: boolean | null
  brands?: string[]
  collections?: string[]
  substrate?: string[]
  materials?: string[]
  shapes?: string[]
  light?: string[]
  temperature?: string[]
  itemStatus?: string | null
  optimized?: boolean
  hasStudioImage?: boolean
  studioImagePath?: string | null
  detailImagePath?: string | null
  maatImagePath?: string | null
}

const euro = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? '—' : `€ ${Number(n).toFixed(2)}`

const cm = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) || Number(n) === 0
    ? '—'
    : `${Math.round(Number(n))} cm`

/** Nieuwkoop Temperature-tag: min. °C (vaak 15 of -20). */
function formatTemps(vals: string[] | undefined): string {
  if (!vals?.length) return '—'
  return vals
    .map((raw) => {
      const s = String(raw).trim()
      if (!s) return null
      // Al eenheid? niet dubbel plakken
      if (/°\s*c/i.test(s) || /celsius/i.test(s)) return s
      const n = Number(s.replace(/[^\d.-]/g, ''))
      if (Number.isFinite(n)) return `min. ${n} °C`
      return `${s} °C`
    })
    .filter(Boolean)
    .join(', ')
}

const LIGHT_WORDS: Record<string, string> = {
  '500': 'Weinig licht',
  '750': 'Halfschaduw',
  '1000': 'Veel licht',
  '1500': 'Volle zon',
}

/** Nieuwkoop LocationLight: lux-waarden → leesbaar + eenheid. */
function formatLights(vals: string[] | undefined): string {
  if (!vals?.length) return '—'
  return vals
    .map((raw) => {
      const s = String(raw).trim()
      if (!s) return null
      if (/lux/i.test(s)) return s
      // "> 1000" e.d.
      const m = s.match(/^([<>]=?)?\s*(\d+)/)
      if (m) {
        const op = m[1] || ''
        const n = m[2]
        const word = LIGHT_WORDS[n]
        const lux = op ? `${op}${n} lux` : `${n} lux`
        return word ? `${word} (${lux})` : lux
      }
      return s
    })
    .filter(Boolean)
    .join(', ')
}

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
  const [marginMsg, setMarginMsg] = useState<string | null>(null)
  const [locMsg, setLocMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [marginDraft, setMarginDraft] = useState('')
  const [locBinnen, setLocBinnen] = useState(false)
  const [locBuiten, setLocBuiten] = useState(false)
  const [mediaMsg, setMediaMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [imgTick, setImgTick] = useState(0)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setMarginMsg(null)
    setLocMsg(null)
    setMediaMsg(null)
    setItem(null)
    fetch(`/api/admin/catalog/${encodeURIComponent(itemcode)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error || 'Laden mislukt')
        if (!cancelled) {
          setItem(data.item)
          const f = data.item?.marginFactor
          setMarginDraft(f != null && Number.isFinite(Number(f)) ? String(Number(f)) : '2')
          // Prefill manuele checkboxes: enrichment, of effectief als NK leeg
          const enrB = data.item?.enrichmentBinnen
          const enrU = data.item?.enrichmentBuiten
          if (enrB != null || enrU != null) {
            setLocBinnen(!!enrB)
            setLocBuiten(!!enrU)
          } else if (data.item?.locationSource === 'none') {
            setLocBinnen(false)
            setLocBuiten(false)
          } else {
            const locs: string[] = data.item?.locations || []
            setLocBinnen(locs.includes('Binnen'))
            setLocBuiten(locs.includes('Buiten'))
          }
        }
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, lightbox])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const draftFactor = useMemo(() => {
    const n = Number(String(marginDraft).replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : null
  }, [marginDraft])

  const previewSale = useMemo(() => {
    if (!item?.costPrice || draftFactor == null) return null
    return Math.round(Number(item.costPrice) * draftFactor * 100) / 100
  }, [item?.costPrice, draftFactor])

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

  function toggleOptimized() {
    if (!item) return
    const next = !item.optimized
    setItem({ ...item, optimized: next })
    setMediaMsg(null)
    startTransition(async () => {
      const res = await setItemOptimized(item.itemcode, next)
      if (!res.ok) {
        setItem({ ...item, optimized: !next })
        setMediaMsg(res.error)
      } else {
        setMediaMsg(next ? 'Gemarkeerd als afgewerkt ✓' : 'Afgewerkt-status verwijderd.')
      }
    })
  }

  async function onStudioUpload(file: File | null) {
    if (!item || !file) return
    setUploading(true)
    setMediaMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(
        `/api/product-media/${encodeURIComponent(item.itemcode)}`,
        { method: 'POST', body: fd }
      )
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Upload mislukt')
      setItem({
        ...item,
        hasStudioImage: true,
        studioImagePath: data.path,
      })
      setImgTick((t) => t + 1)
      setMediaMsg('Studiofoto opgeslagen — thumbnail gebruikt nu studio.')
    } catch (e) {
      setMediaMsg(e instanceof Error ? e.message : 'Upload mislukt')
    } finally {
      setUploading(false)
    }
  }

  async function removeStudio() {
    if (!item) return
    setUploading(true)
    setMediaMsg(null)
    try {
      const res = await fetch(
        `/api/product-media/${encodeURIComponent(item.itemcode)}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Verwijderen mislukt')
      setItem({ ...item, hasStudioImage: false, studioImagePath: null })
      setImgTick((t) => t + 1)
      setMediaMsg('Studiofoto verwijderd — thumbnail = Nieuwkoop-origineel.')
    } catch (e) {
      setMediaMsg(e instanceof Error ? e.message : 'Verwijderen mislukt')
    } finally {
      setUploading(false)
    }
  }

  function saveMargin() {
    if (!item || draftFactor == null) {
      setMarginMsg('Vul een geldige factor in (bv. 2 of 2,5).')
      return
    }
    setMarginMsg(null)
    startTransition(async () => {
      const res = await setItemMarginFactor(item.itemcode, draftFactor)
      if (!res.ok) {
        setMarginMsg(res.error)
        return
      }
      setItem({
        ...item,
        marginFactor: draftFactor,
        marginIsCustom: true,
        itemMarginFactor: draftFactor,
      })
      setMarginMsg(`Marge opgeslagen: ${draftFactor}× (item-override).`)
    })
  }

  function saveLocation() {
    if (!item) return
    setLocMsg(null)
    startTransition(async () => {
      const res = await setItemLocation(item.itemcode, {
        binnen: locBinnen,
        buiten: locBuiten,
      })
      if (!res.ok) {
        setLocMsg(res.error)
        return
      }
      // Herlaad effectieve locatie
      try {
        const r = await fetch(`/api/admin/catalog/${encodeURIComponent(item.itemcode)}`)
        const data = await r.json()
        if (data.item) setItem(data.item)
      } catch {
        /* ignore */
      }
      if (!locBinnen && !locBuiten) {
        setLocMsg('Manuele locatie gewist.')
      } else {
        setLocMsg(
          `Locatie opgeslagen: ${[locBinnen && 'Binnen', locBuiten && 'Buiten'].filter(Boolean).join(' + ')}.`
        )
      }
    })
  }

  function resetMargin() {
    if (!item) return
    setMarginMsg(null)
    startTransition(async () => {
      const res = await setItemMarginFactor(item.itemcode, null)
      if (!res.ok) {
        setMarginMsg(res.error)
        return
      }
      // Herlaad effectieve factor (groep/default)
      try {
        const r = await fetch(`/api/admin/catalog/${encodeURIComponent(item.itemcode)}`)
        const data = await r.json()
        if (data.item) {
          setItem(data.item)
          const f = data.item.marginFactor
          setMarginDraft(f != null ? String(Number(f)) : '2')
        }
      } catch {
        /* ignore */
      }
      setMarginMsg('Item-marge gewist — opnieuw groep/default.')
    })
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="Sluiten"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[min(92vh,880px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-stera-line bg-stera-cream shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-stera-line bg-white/80 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-stera-ink">
              {item?.description || 'Productdetail'}
            </p>
            <p className="font-mono text-xs text-stera-ink-soft">{itemcode}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-stera-line bg-white px-3 py-1.5 text-sm font-medium text-stera-ink hover:border-stera-green/50"
          >
            Sluiten
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-stera-ink-soft">Laden…</p>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : item ? (
            <div className="space-y-4">
              <div className="flex gap-4">
                {/* Primary thumb = klein; klik → full-res lightbox */}
                <button
                  type="button"
                  className="shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-stera-green/40"
                  title="Klik voor grote foto"
                  onClick={() => {
                    const full = item.hasStudioImage
                      ? `${studioImageApiUrl(item.itemcode, 'full')}&t=${imgTick}`
                      : `${originalImageApiUrl(item.itemcode, 'full')}?t=${imgTick}`
                    setLightbox({ src: full, alt: item.description })
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      item.hasStudioImage
                        ? `${studioImageApiUrl(item.itemcode, 'thumb')}&t=${imgTick}`
                        : `${originalImageApiUrl(item.itemcode, 'thumb')}&t=${imgTick}`
                    }
                    alt=""
                    className="h-32 w-32 rounded-xl object-cover shadow-sm sm:h-40 sm:w-40 bg-white hover:opacity-95"
                    onError={(e) => {
                      e.currentTarget.onerror = null
                      e.currentTarget.src = mediaPlaceholder('foto mislukt')
                    }}
                  />
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <h2 className="text-base font-semibold leading-snug text-stera-ink sm:text-lg">
                    {item.description}
                  </h2>
                  {item.detail ? (
                    <p className="line-clamp-4 text-sm leading-relaxed text-stera-ink-soft">
                      {item.detail}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {item.optimized ? (
                      <span className="rounded-full bg-stera-green/15 px-2 py-0.5 text-[10px] font-semibold text-stera-green">
                        Afgewerkt
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Niet afgewerkt
                      </span>
                    )}
                    {item.hasStudioImage ? (
                      <span className="rounded-full border border-stera-green/30 px-2 py-0.5 text-[10px] text-stera-green">
                        Studiofoto
                      </span>
                    ) : null}
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

              {/* Foto's: pipeline per product + previews */}
              <section className="rounded-xl border border-stera-green/30 bg-white p-3 text-sm">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Foto&apos;s — dit product
                </h3>
                <p className="mb-3 text-[11px] text-stera-ink-soft">
                  Genereert voor <strong className="text-stera-ink">{item.itemcode}</strong>:{' '}
                  1 hoofdfoto (studio), 1 detail, 1 maatfoto. Origineel Nieuwkoop blijft
                  bewaard.
                </p>

                <button
                  type="button"
                  disabled={uploading || pending}
                  className="stera-cta stera-cta-primary mb-3 w-full text-sm disabled:opacity-50"
                  onClick={async () => {
                    setUploading(true)
                    setMediaMsg(
                      `${item.itemcode}: bezig met studio + detail + maat (30–90s)…`
                    )
                    try {
                      const res = await fetch('/api/admin/photos/optimize/run', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ itemcode: item.itemcode }),
                      })
                      const data = await res.json()
                      if (!res.ok || data.error) throw new Error(data.error || 'Mislukt')
                      const r = await fetch(
                        `/api/admin/catalog/${encodeURIComponent(item.itemcode)}`
                      )
                      const d = await r.json()
                      if (d.item) setItem(d.item)
                      setImgTick((t) => t + 1)
                      setMediaMsg('Klaar: studio + detail + maat opgeslagen.')
                    } catch (e) {
                      setMediaMsg(e instanceof Error ? e.message : 'Pipeline mislukt')
                    } finally {
                      setUploading(false)
                    }
                  }}
                >
                  {uploading
                    ? 'Bezig met fotoset… even geduld'
                    : item.hasStudioImage
                      ? 'Fotoset opnieuw genereren (studio + detail + maat)'
                      : 'Fotoset genereren (studio + detail + maat)'}
                </button>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      {
                        key: 'studio',
                        label: 'Studio',
                        has: !!item.hasStudioImage,
                        thumb: productMediaUrl(item.itemcode, 'studio', 'thumb'),
                        full: productMediaUrl(item.itemcode, 'studio', 'full'),
                        empty: 'geen studio',
                      },
                      {
                        key: 'detail',
                        label: 'Detail',
                        has: !!item.detailImagePath,
                        thumb: productMediaUrl(item.itemcode, 'detail', 'thumb'),
                        full: productMediaUrl(item.itemcode, 'detail', 'full'),
                        empty: 'geen detail',
                      },
                      {
                        key: 'maat',
                        label: 'Maat',
                        has: !!item.maatImagePath,
                        thumb: productMediaUrl(item.itemcode, 'maat', 'thumb'),
                        full: productMediaUrl(item.itemcode, 'maat', 'full'),
                        empty: 'geen maat',
                      },
                      {
                        key: 'original',
                        label: 'Origineel (NK)',
                        has: true,
                        thumb: originalImageApiUrl(item.itemcode, 'thumb'),
                        full: originalImageApiUrl(item.itemcode, 'full'),
                        empty: 'geen origineel',
                      },
                    ] as const
                  ).map((slot) => (
                    <div key={slot.key}>
                      <p className="mb-1 text-[11px] font-semibold text-stera-ink">
                        {slot.label}
                        {slot.has && slot.key === 'studio' ? (
                          <span className="ml-1 font-normal text-stera-green">
                            · klik = groot
                          </span>
                        ) : null}
                      </p>
                      {slot.has ? (
                        <button
                          type="button"
                          className="block w-full focus:outline-none focus:ring-2 focus:ring-stera-green/40 rounded-lg"
                          title="Klik voor grote foto"
                          onClick={() =>
                            setLightbox({
                              src: `${slot.full}${slot.full.includes('?') ? '&' : '?'}t=${imgTick}`,
                              alt: `${slot.label} ${item.itemcode}`,
                            })
                          }
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`${slot.thumb}${slot.thumb.includes('?') ? '&' : '?'}t=${imgTick}`}
                            alt={slot.label}
                            className="aspect-square w-full rounded-lg border border-stera-line bg-stera-cream object-cover"
                            onError={(e) => {
                              e.currentTarget.onerror = null
                              e.currentTarget.src = mediaPlaceholder('laden mislukt')
                            }}
                          />
                        </button>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaPlaceholder(slot.empty)}
                          alt={slot.empty}
                          className="aspect-square w-full rounded-lg border border-stera-line bg-stera-cream object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="stera-cta stera-cta-secondary cursor-pointer text-sm">
                    {uploading ? 'Bezig…' : 'Studio handmatig uploaden'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading || pending}
                      onChange={(e) => onStudioUpload(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {item.hasStudioImage ? (
                    <button
                      type="button"
                      onClick={removeStudio}
                      disabled={uploading || pending}
                      className="stera-cta stera-cta-secondary text-sm disabled:opacity-50"
                    >
                      Studio verwijderen
                    </button>
                  ) : null}
                </div>
                {mediaMsg ? (
                  <p
                    className={`mt-2 text-xs ${
                      mediaMsg.toLowerCase().includes('fout') ||
                      mediaMsg.toLowerCase().includes('mislukt')
                        ? 'text-red-700'
                        : 'text-stera-green'
                    }`}
                  >
                    {mediaMsg}
                  </p>
                ) : null}
              </section>

              <button
                type="button"
                onClick={toggleOptimized}
                disabled={pending}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                  item.optimized
                    ? 'bg-stera-green text-white'
                    : 'border-2 border-dashed border-stera-green/40 bg-white text-stera-ink'
                }`}
              >
                {item.optimized
                  ? '✓ Afgewerkt & geoptimaliseerd — klik om terug te zetten'
                  : 'Markeer als afgewerkt & geoptimaliseerd'}
              </button>

              <button
                type="button"
                onClick={toggleOffer}
                disabled={pending}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                  item.offered
                    ? 'bg-stera-green text-white'
                    : 'border border-stera-line bg-white text-stera-ink hover:border-stera-green/40'
                }`}
              >
                {item.offered
                  ? '✓ Wordt aangeboden — klik om uit te zetten'
                  : 'Aanbieden in webshop'}
              </button>

              {locationAppliesToType(item.catalogType) ? (
                <section className="rounded-xl border border-stera-line bg-white p-3 text-sm">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-green">
                    Standplaats (Binnen / Buiten)
                  </h3>
                  <p className="mb-2 text-[11px] text-stera-ink-soft">
                    Alleen relevant voor planten, potten, combinaties en mos. Bron Nieuwkoop:
                    tag Location — anders manueel.
                  </p>
                  <Row label="Effectief">
                    {item.locations?.length ? (
                      <span>
                        {item.locations.join(' + ')}
                        <span className="ml-1 text-stera-ink-soft">
                          (
                          {item.locationSource === 'nieuwkoop'
                            ? 'Nieuwkoop'
                            : item.locationSource === 'manual'
                              ? 'Stera manueel'
                              : item.locationSource === 'rule'
                                ? 'regel'
                                : 'onbekend'}
                          )
                        </span>
                      </span>
                    ) : (
                      <span className="font-semibold text-amber-800">Ontbreekt</span>
                    )}
                  </Row>
                  {item.locationsNieuwkoop && item.locationsNieuwkoop.length > 0 ? (
                    <Row label="Nieuwkoop">{item.locationsNieuwkoop.join(' + ')}</Row>
                  ) : (
                    <Row label="Nieuwkoop">
                      <span className="text-amber-800">geen Location-tag</span>
                    </Row>
                  )}

                  <div className="mt-3 space-y-2 border-t border-stera-line/60 pt-3">
                    <p className="text-xs font-semibold text-stera-ink">
                      Manueel instellen
                      {item.locationSource === 'nieuwkoop' ? (
                        <span className="ml-1 font-normal text-stera-ink-soft">
                          (NK heeft voorrang; manueel = fallback)
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={locBinnen}
                          onChange={(e) => setLocBinnen(e.target.checked)}
                        />
                        Binnen
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={locBuiten}
                          onChange={(e) => setLocBuiten(e.target.checked)}
                        />
                        Buiten
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={saveLocation}
                        disabled={pending}
                        className="stera-cta stera-cta-primary text-sm disabled:opacity-50"
                      >
                        Locatie opslaan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLocBinnen(false)
                          setLocBuiten(false)
                          startTransition(async () => {
                            const res = await setItemLocation(item.itemcode, {
                              binnen: false,
                              buiten: false,
                            })
                            if (!res.ok) setLocMsg(res.error)
                            else {
                              setLocMsg('Manuele locatie gewist.')
                              try {
                                const r = await fetch(
                                  `/api/admin/catalog/${encodeURIComponent(item.itemcode)}`
                                )
                                const data = await r.json()
                                if (data.item) setItem(data.item)
                              } catch {
                                /* ignore */
                              }
                            }
                          })
                        }}
                        disabled={pending}
                        className="stera-cta stera-cta-secondary text-sm disabled:opacity-50"
                      >
                        Wissen
                      </button>
                    </div>
                    {locMsg ? <p className="text-xs text-stera-green">{locMsg}</p> : null}
                  </div>
                </section>
              ) : (
                <section className="rounded-xl border border-dashed border-stera-line bg-white/60 p-3 text-sm text-stera-ink-soft">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stera-ink-soft">
                    Standplaats
                  </p>
                  <p className="mt-1 text-sm">
                    N.v.t. voor dit type
                    {item.catalogType ? ` (${item.catalogType})` : ''} — artificial,
                    accessoires e.d. hebben geen Binnen/Buiten.
                  </p>
                </section>
              )}

              <section className="rounded-xl border border-stera-line bg-white p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Prijs & marge
                </h3>
                <Row label="Inkoop (Nieuwkoop)">{euro(item.costPrice)}</Row>
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

                <div className="mt-3 space-y-2 border-t border-stera-line/60 pt-3">
                  <label className="block text-xs font-semibold text-stera-ink">
                    Margefactor
                    {item.marginIsCustom ? (
                      <span className="ml-1.5 font-normal text-stera-green">(item-override)</span>
                    ) : (
                      <span className="ml-1.5 font-normal text-stera-ink-soft">
                        (groep/default)
                      </span>
                    )}
                  </label>
                  <p className="text-[11px] text-stera-ink-soft">
                    2 = 100% opslag (inkoop × 2). Verkoopprijs in Shopify = inkoop × factor
                    (excl. btw).
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={marginDraft}
                      onChange={(e) => setMarginDraft(e.target.value)}
                      className="w-28 rounded-lg border border-stera-line bg-stera-cream px-3 py-2 text-sm font-mono"
                      aria-label="Margefactor"
                    />
                    <span className="text-sm text-stera-ink-soft">×</span>
                    <button
                      type="button"
                      onClick={saveMargin}
                      disabled={pending || draftFactor == null}
                      className="stera-cta stera-cta-primary text-sm disabled:opacity-50"
                    >
                      Opslaan
                    </button>
                    {item.marginIsCustom ? (
                      <button
                        type="button"
                        onClick={resetMargin}
                        disabled={pending}
                        className="stera-cta stera-cta-secondary text-sm disabled:opacity-50"
                      >
                        Reset naar default
                      </button>
                    ) : null}
                  </div>
                  {previewSale != null ? (
                    <p className="text-xs text-stera-ink-soft">
                      Rekenvoorbeeld:{' '}
                      <strong className="text-stera-ink">
                        {euro(item.costPrice)} × {draftFactor} = {euro(previewSale)} excl. btw
                      </strong>
                    </p>
                  ) : null}
                  {marginMsg ? (
                    <p className="text-xs text-stera-green">{marginMsg}</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-stera-line bg-white p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Afmetingen
                </h3>
                <Row label="Hoogte">{cm(item.height)}</Row>
                <Row label="Diameter">{cm(item.diameter)}</Row>
                <Row label="L × B">
                  {item.length || item.width ? `${cm(item.length)} × ${cm(item.width)}` : '—'}
                </Row>
                <Row label="Potmaat">{item.potSize || '—'}</Row>
                <Row label="Cultuurpot Ø">{cm(item.diameterCulturePot)}</Row>
              </section>

              <section className="rounded-xl border border-stera-line bg-white p-3 text-sm">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Kenmerken
                </h3>
                <Row label="Hoofdgroep">{item.mainGroup || '—'}</Row>
                <Row label="Productgroep">{item.productGroup || '—'}</Row>
                <Row label="Groep">{item.group || '—'}</Row>
                <Row label="Variety">{item.variety || '—'}</Row>
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
                <Row label="Lichtbehoefte">{formatLights(item.light)}</Row>
                <Row label="Temperatuur">{formatTemps(item.temperature)}</Row>
              </section>
            </div>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-stera-line bg-white/80 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="stera-cta stera-cta-primary w-full text-sm"
          >
            Terug naar catalogus
          </button>
        </footer>
      </div>

      <ImageLightbox
        open={!!lightbox}
        src={lightbox?.src || ''}
        alt={lightbox?.alt || ''}
        onClose={() => setLightbox(null)}
      />
    </div>
  )
}
