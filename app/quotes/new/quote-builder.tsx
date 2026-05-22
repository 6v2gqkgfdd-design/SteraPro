'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createQuote } from './actions'

export type LocationOption = {
  id: string
  companyId: string | null
  label: string
}

type CatalogItem = {
  itemcode: string
  description: string | null
  item_picture_name: string | null
  cost_price: number | null
  suggested_sale_price: number | null
  product_group_code: string
  height: number | null
  diameter_culture_pot: number | null
  pot_size: string | null
  location_icon_nl: string | null
}

type Line = {
  key: string
  lineType: 'plant' | 'outer_pot' | 'custom'
  supplier: 'nieuwkoop' | 'stera' | null
  itemcode: string | null
  name: string
  description: string | null
  spec: string | null
  imageUrl: string | null
  supplierUnitPriceCents: number | null
  unitPriceEuro: string
  quantity: number
}

let keyCounter = 0
function nextKey() {
  keyCounter += 1
  return `line-${keyCounter}`
}

function euroToCents(value: string): number {
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function buildSpec(item: CatalogItem): string {
  const parts: string[] = []
  if (item.height && item.height > 0) {
    parts.push(`H ${Math.round(item.height)} cm`)
  }
  if (item.diameter_culture_pot && item.diameter_culture_pot > 0) {
    parts.push(`pot Ø ${Math.round(item.diameter_culture_pot)} cm`)
  } else if (item.pot_size) {
    parts.push(`maat ${item.pot_size}`)
  }
  return parts.join(' · ')
}

const LINE_TYPE_LABEL: Record<Line['lineType'], string> = {
  plant: 'Plant',
  outer_pot: 'Buitenpot',
  custom: 'Vrije regel',
}

export default function QuoteBuilder({
  locations,
}: {
  locations: LocationOption[]
}) {
  const [locationId, setLocationId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [introNote, setIntroNote] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  // Catalogus-kiezer
  const [pickerGroup, setPickerGroup] = useState<'100' | '300' | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerResults, setPickerResults] = useState<CatalogItem[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState('')
  const [pickerTouched, setPickerTouched] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{
    quoteId: string
    referenceNumber: string | null
  } | null>(null)

  const subtotalCents = lines.reduce(
    (sum, l) => sum + euroToCents(l.unitPriceEuro) * Math.max(1, l.quantity),
    0
  )

  function openPicker(group: '100' | '300') {
    setPickerGroup(group)
    setPickerQuery('')
    setPickerResults([])
    setPickerError('')
    setPickerTouched(false)
  }

  async function runSearch() {
    if (!pickerGroup) return
    setPickerLoading(true)
    setPickerError('')
    setPickerTouched(true)
    try {
      const params = new URLSearchParams({ group: pickerGroup })
      if (pickerQuery.trim()) params.set('q', pickerQuery.trim())
      const res = await fetch(`/api/catalog/search?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Zoeken mislukt.')
      }
      setPickerResults(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      setPickerResults([])
      setPickerError(
        err instanceof Error ? err.message : 'Zoeken mislukt.'
      )
    } finally {
      setPickerLoading(false)
    }
  }

  function addCatalogLine(item: CatalogItem) {
    const isPot = pickerGroup === '300'
    const sale = item.suggested_sale_price ?? 0
    const cost = item.cost_price ?? null
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        lineType: isPot ? 'outer_pot' : 'plant',
        supplier: 'nieuwkoop',
        itemcode: item.itemcode,
        name: item.description || item.itemcode,
        description: null,
        spec: buildSpec(item) || null,
        imageUrl: item.item_picture_name
          ? `/api/nieuwkoop/image/${encodeURIComponent(item.itemcode)}`
          : null,
        supplierUnitPriceCents:
          cost != null ? Math.round(cost * 100) : null,
        unitPriceEuro: sale > 0 ? String(sale.toFixed(2)) : '',
        quantity: 1,
      },
    ])
    setPickerGroup(null)
  }

  function addCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        lineType: 'custom',
        supplier: null,
        itemcode: null,
        name: '',
        description: null,
        spec: null,
        imageUrl: null,
        supplierUnitPriceCents: null,
        unitPriceEuro: '',
        quantity: 1,
      },
    ])
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    )
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function handleSave() {
    setError('')
    if (lines.length === 0) {
      setError('Voeg minstens één regel toe aan de offerte.')
      return
    }
    if (lines.some((l) => !l.name.trim())) {
      setError('Elke regel heeft een naam nodig.')
      return
    }
    setSaving(true)
    const selected = locations.find((l) => l.id === locationId) || null
    const result = await createQuote({
      locationId: selected?.id ?? null,
      companyId: selected?.companyId ?? null,
      customerName,
      customerEmail,
      introNote,
      validUntil: validUntil || null,
      sourceVisitId: null,
      lines: lines.map((l) => ({
        lineType: l.lineType,
        supplier: l.supplier,
        itemcode: l.itemcode,
        name: l.name,
        description: l.description,
        spec: l.spec,
        imageUrl: l.imageUrl,
        supplierUnitPriceCents: l.supplierUnitPriceCents,
        unitPriceCents: euroToCents(l.unitPriceEuro),
        quantity: Math.max(1, l.quantity),
      })),
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSuccess({
      quoteId: result.quoteId,
      referenceNumber: result.referenceNumber,
    })
  }

  if (success) {
    return (
      <div className="stera-card space-y-4 text-center">
        <p className="text-3xl">✓</p>
        <div>
          <p className="font-semibold text-stera-ink">Offerte aangemaakt</p>
          <p className="mt-1 text-sm text-stera-ink-soft">
            {success.referenceNumber
              ? `Offertenummer ${success.referenceNumber}.`
              : 'De offerte is opgeslagen.'}{' '}
            Ze staat als concept klaar.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/quotes/new" className="stera-cta stera-cta-secondary">
            Nog een offerte
          </Link>
          <Link href="/dashboard" className="stera-cta stera-cta-ghost">
            Naar dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Klantgegevens */}
      <section className="stera-card space-y-3">
        <p className="stera-eyebrow text-stera-green">Klant</p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-stera-ink-soft">
            Locatie
          </span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-2.5"
          >
            <option value="">— Kies een klant-locatie —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-stera-ink-soft">
              Contactpersoon
            </span>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-2.5"
              placeholder="Naam klant"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-stera-ink-soft">
              E-mail
            </span>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-2.5"
              placeholder="E-mailadres klant"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-stera-ink-soft">
            Geldig tot (optioneel)
          </span>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-2.5 sm:w-56"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-stera-ink-soft">
            Begeleidend bericht (optioneel)
          </span>
          <textarea
            value={introNote}
            onChange={(e) => setIntroNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-stera-line bg-white p-2.5"
            placeholder="Korte toelichting voor de klant..."
          />
        </label>
      </section>

      {/* Regels */}
      <section className="stera-card space-y-3">
        <p className="stera-eyebrow text-stera-green">Offerteregels</p>

        {lines.length === 0 ? (
          <p className="text-sm text-stera-ink-soft">
            Nog geen regels. Voeg een plant, een buitenpot of een vrije
            regel toe.
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((l) => {
              const lineTotal =
                euroToCents(l.unitPriceEuro) * Math.max(1, l.quantity)
              return (
                <li
                  key={l.key}
                  className="rounded-xl border border-stera-line bg-white p-3"
                >
                  <div className="flex flex-wrap gap-3">
                    {l.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.imageUrl}
                        alt={l.name}
                        className="h-16 w-16 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-[10px] text-stera-ink-soft">
                        {LINE_TYPE_LABEL[l.lineType]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="inline-block rounded-full bg-stera-cream-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
                        {LINE_TYPE_LABEL[l.lineType]}
                      </span>
                      {l.lineType === 'custom' ? (
                        <input
                          type="text"
                          value={l.name}
                          onChange={(e) =>
                            updateLine(l.key, { name: e.target.value })
                          }
                          placeholder="Omschrijving"
                          className="w-full rounded-lg border border-stera-line bg-white p-2 text-sm"
                        />
                      ) : (
                        <p className="text-sm font-medium text-stera-ink">
                          {l.name}
                        </p>
                      )}
                      {l.spec ? (
                        <p className="text-xs text-stera-ink-soft">
                          {l.spec}
                        </p>
                      ) : null}
                      {l.itemcode ? (
                        <p className="font-mono text-[11px] text-stera-ink-soft">
                          {l.itemcode}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="text-xs text-stera-ink-soft hover:text-red-600"
                    >
                      verwijderen
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-stera-line pt-3">
                    <label className="text-xs text-stera-ink-soft">
                      <span className="mb-1 block">Aantal</span>
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) =>
                          updateLine(l.key, {
                            quantity: Math.max(
                              1,
                              Math.round(Number(e.target.value) || 1)
                            ),
                          })
                        }
                        className="w-20 rounded-lg border border-stera-line bg-white p-2 text-sm"
                      />
                    </label>
                    <label className="text-xs text-stera-ink-soft">
                      <span className="mb-1 block">Prijs/stuk (excl. btw)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={l.unitPriceEuro}
                        onChange={(e) =>
                          updateLine(l.key, { unitPriceEuro: e.target.value })
                        }
                        placeholder="0,00"
                        className="w-28 rounded-lg border border-stera-line bg-white p-2 text-sm"
                      />
                    </label>
                    <div className="ml-auto text-right">
                      <span className="block text-[10px] uppercase tracking-wider text-stera-ink-soft">
                        Regeltotaal
                      </span>
                      <span className="font-semibold tabular-nums text-stera-ink">
                        {formatEuro(lineTotal)}
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* Toevoeg-knoppen */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openPicker('100')}
            className="stera-cta stera-cta-secondary"
          >
            + Hydrocultuur-plant
          </button>
          <button
            type="button"
            onClick={() => openPicker('300')}
            className="stera-cta stera-cta-secondary"
          >
            + Buitenpot
          </button>
          <button
            type="button"
            onClick={addCustomLine}
            className="stera-cta stera-cta-ghost"
          >
            + Vrije regel
          </button>
        </div>

        {/* Catalogus-kiezer */}
        {pickerGroup ? (
          <div className="rounded-xl border border-stera-green/40 bg-stera-cream-deep/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-stera-ink">
                {pickerGroup === '300'
                  ? 'Buitenpot kiezen'
                  : 'Hydrocultuur-plant kiezen'}
              </p>
              <button
                type="button"
                onClick={() => setPickerGroup(null)}
                className="text-xs text-stera-ink-soft hover:text-stera-ink"
              >
                sluiten
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    runSearch()
                  }
                }}
                placeholder="Zoek op naam (bv. Kentia, Dracaena)..."
                className="flex-1 rounded-lg border border-stera-line bg-white p-2 text-sm"
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={pickerLoading}
                className="stera-cta stera-cta-primary disabled:opacity-50"
              >
                {pickerLoading ? 'Zoeken…' : 'Zoeken'}
              </button>
            </div>

            {pickerError ? (
              <p className="mt-2 text-xs text-red-600">{pickerError}</p>
            ) : null}

            {pickerTouched &&
            !pickerLoading &&
            !pickerError &&
            pickerResults.length === 0 ? (
              <p className="mt-2 text-xs text-stera-ink-soft">
                Geen resultaten. Probeer een andere zoekterm.
              </p>
            ) : null}

            {pickerResults.length > 0 ? (
              <ul className="mt-3 grid max-h-80 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
                {pickerResults.map((item) => {
                  const sale = item.suggested_sale_price ?? 0
                  return (
                    <li key={item.itemcode}>
                      <button
                        type="button"
                        onClick={() => addCatalogLine(item)}
                        className="flex w-full gap-2 rounded-lg border border-stera-line bg-white p-2 text-left transition hover:border-stera-green"
                      >
                        {item.item_picture_name ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/nieuwkoop/image/${encodeURIComponent(
                              item.itemcode
                            )}`}
                            alt={item.description || item.itemcode}
                            className="h-14 w-14 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-[9px] text-stera-ink-soft">
                            geen foto
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-stera-ink">
                            {item.description || item.itemcode}
                          </p>
                          <p className="text-[11px] text-stera-ink-soft">
                            {buildSpec(item)}
                          </p>
                          <p className="text-xs font-semibold text-stera-green">
                            {sale > 0
                              ? formatEuro(Math.round(sale * 100))
                              : 'prijs onbekend'}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Totaal + opslaan */}
      <section className="stera-card space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="stera-eyebrow text-stera-green">
            Totaal (excl. btw)
          </span>
          <span className="text-xl font-bold tabular-nums text-stera-ink">
            {formatEuro(subtotalCents)}
          </span>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="stera-cta stera-cta-primary disabled:opacity-50"
          >
            {saving ? 'Opslaan…' : 'Offerte opslaan'}
          </button>
          <Link href="/dashboard" className="stera-cta stera-cta-ghost">
            Annuleren
          </Link>
        </div>
      </section>
    </div>
  )
}
