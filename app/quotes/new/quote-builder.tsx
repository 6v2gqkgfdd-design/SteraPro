'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createQuote } from './actions'
import { woImage } from '@/lib/wo-image'

export type LocationOption = {
  id: string
  companyId: string | null
  label: string
}

export type ReplacementSlot = {
  visitPlantId: string
  photoUrl: string | null
  currentPotLabel: string | null
  // false = dode plant waar de tech "Nee" antwoordde op "moet ze
  // vervangen worden?". Verschijnt nog steeds in de offerte, maar
  // initieel als uitlegregel zonder voorgestelde plant.
  wantsReplacement: boolean
  oldPlantName: string
  oldPlantSpecies: string | null
  light: 'high' | 'medium' | 'low' | null
  heightCm: number | null
  potDiameterCm: number | null
  isHanging: boolean
  careLevel: 'easy' | 'hard' | null
  needsOuterPot: boolean
  notes: string | null
}

export type VisitPrefill = {
  visitId: string
  companyId: string | null
  locationId: string | null
  customerName: string
  customerEmail: string
  slots: ReplacementSlot[]
}

// Server geeft per slot al een voorgesteld artikel mee zodat de builder
// niet leeg opent. Cents → euro-string gebeurt bij het seeden.
export type InitialLineInput = {
  slotId: string
  lineType: 'plant' | 'outer_pot' | 'custom' | 'combination'
  supplier: 'nieuwkoop' | 'stera' | null
  itemcode: string | null
  name: string
  description: string | null
  spec: string | null
  imageUrl: string | null
  supplierUnitPriceCents: number | null
  unitPriceCents: number
  quantity: number
}

type CatalogItem = {
  itemcode: string
  description: string | null
  item_picture_name: string | null
  cost_price: number | null
  suggested_sale_price: number | null
  product_group_code: string
  height: number | null
  diameter: number | null
  diameter_culture_pot: number | null
  pot_size: string | null
  location_icon_nl: string | null
}

type Line = {
  key: string
  slotId: string | null
  lineType: 'plant' | 'outer_pot' | 'custom' | 'combination'
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

type PickerTarget =
  | { kind: 'extra' }
  | { kind: 'slot'; slotId: string }

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
  if (
    item.product_group_code === '300' ||
    item.product_group_code === '275'
  ) {
    // Combinatie of buitenpot — toon de eigen diameter van de pot.
    if (item.diameter && item.diameter > 0) {
      parts.push(`Ø ${Math.round(item.diameter)} cm`)
    } else if (item.pot_size) {
      parts.push(`maat ${item.pot_size}`)
    }
  } else if (item.diameter_culture_pot && item.diameter_culture_pot > 0) {
    parts.push(`pot Ø ${Math.round(item.diameter_culture_pot)} cm`)
  } else if (item.pot_size) {
    parts.push(`maat ${item.pot_size}`)
  }
  if (item.location_icon_nl) {
    parts.push(item.location_icon_nl)
  }
  return parts.join(' · ')
}

const LINE_TYPE_LABEL: Record<Line['lineType'], string> = {
  combination: 'Combinatie',
  plant: 'Plant',
  outer_pot: 'Buitenpot',
  custom: 'Vrije regel',
}

const LIGHT_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'Zon',
  medium: 'Half-schaduw',
  low: 'Schaduw',
}

// Het onderhoud bewaart licht als high/medium/low; de catalogus gebruikt
// zon/half-schaduw/schaduw (kolom location_icon_nl).
const LIGHT_TO_CATALOG: Record<'high' | 'medium' | 'low', string> = {
  high: 'zon',
  medium: 'half-schaduw',
  low: 'schaduw',
}

const CARE_LABEL: Record<'easy' | 'hard', string> = {
  easy: 'Makkelijk in onderhoud',
  hard: 'Mag moeilijker',
}

export default function QuoteBuilder({
  locations,
  visitPrefill,
  initialLines = [],
}: {
  locations: LocationOption[]
  visitPrefill?: VisitPrefill | null
  initialLines?: InitialLineInput[]
}) {
  const slots = visitPrefill?.slots ?? []

  const [locationId, setLocationId] = useState(
    visitPrefill?.locationId ?? ''
  )
  const [customerName, setCustomerName] = useState(
    visitPrefill?.customerName ?? ''
  )
  const [customerEmail, setCustomerEmail] = useState(
    visitPrefill?.customerEmail ?? ''
  )
  const [introNote, setIntroNote] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [lines, setLines] = useState<Line[]>(() =>
    initialLines.map((l) => ({
      key: nextKey(),
      slotId: l.slotId,
      lineType: l.lineType,
      supplier: l.supplier,
      itemcode: l.itemcode,
      name: l.name,
      description: l.description,
      spec: l.spec,
      imageUrl: l.imageUrl,
      supplierUnitPriceCents: l.supplierUnitPriceCents,
      unitPriceEuro:
        l.unitPriceCents > 0 ? (l.unitPriceCents / 100).toFixed(2) : '',
      quantity: l.quantity,
    }))
  )

  // Catalogus-kiezer — werkt op de All-in-1 combinaties (groep 275).
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerLight, setPickerLight] = useState('')
  const [pickerPotMin, setPickerPotMin] = useState('')
  const [pickerPotMax, setPickerPotMax] = useState('')
  const [pickerResults, setPickerResults] = useState<CatalogItem[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState('')
  const [pickerTouched, setPickerTouched] = useState(false)
  const [pickerLightFallback, setPickerLightFallback] = useState(false)
  const [pickerSizeFallback, setPickerSizeFallback] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{
    quoteId: string
    referenceNumber: string | null
  } | null>(null)

  const extraLines = lines.filter((l) => l.slotId === null)
  const subtotalCents = lines.reduce(
    (sum, l) => sum + euroToCents(l.unitPriceEuro) * Math.max(1, l.quantity),
    0
  )

  async function performSearch(opts: {
    group: '100' | '275' | '300'
    q: string
    light: string
    potMin: string
    potMax: string
  }): Promise<CatalogItem[]> {
    setPickerLoading(true)
    setPickerError('')
    setPickerTouched(true)
    try {
      const params = new URLSearchParams({ group: opts.group })
      if (opts.q.trim()) params.set('q', opts.q.trim())
      if (opts.light) params.set('light', opts.light)
      if (opts.potMin) params.set('potMin', opts.potMin)
      if (opts.potMax) params.set('potMax', opts.potMax)
      const res = await fetch(`/api/catalog/search?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Zoeken mislukt.')
      }
      const items: CatalogItem[] = Array.isArray(data.items)
        ? data.items
        : []
      setPickerResults(items)
      return items
    } catch (err) {
      setPickerResults([])
      setPickerError(err instanceof Error ? err.message : 'Zoeken mislukt.')
      return []
    } finally {
      setPickerLoading(false)
    }
  }

  function runSearch() {
    setPickerLightFallback(false)
    setPickerSizeFallback(false)
    performSearch({
      group: '275',
      q: pickerQuery,
      light: pickerLight,
      potMin: pickerPotMin,
      potMax: pickerPotMax,
    })
  }

  function openPickerExtra() {
    setPickerQuery('')
    setPickerLight('')
    setPickerPotMin('')
    setPickerPotMax('')
    setPickerResults([])
    setPickerError('')
    setPickerTouched(false)
    setPickerLightFallback(false)
    setPickerSizeFallback(false)
    setPickerTarget({ kind: 'extra' })
    performSearch({
      group: '275',
      q: '',
      light: '',
      potMin: '',
      potMax: '',
    })
  }

  async function openPickerSlot(slotId: string) {
    const slot = slots.find((s) => s.visitPlantId === slotId)
    if (!slot) return
    setPickerQuery('')
    setPickerError('')
    setPickerResults([])
    setPickerTouched(false)
    setPickerLightFallback(false)
    setPickerSizeFallback(false)

    const light = slot.light ? LIGHT_TO_CATALOG[slot.light] : ''
    const p = slot.potDiameterCm
    const potMin = p ? String(Math.max(1, p - 2)) : ''
    const potMax = p ? String(p + 2) : ''
    setPickerLight(light)
    setPickerPotMin(potMin)
    setPickerPotMax(potMax)
    setPickerTarget({ kind: 'slot', slotId })

    const items = await performSearch({
      group: '275',
      q: '',
      light,
      potMin,
      potMax,
    })
    // Geen exacte match op lichtbehoefte? Toon dan alle combinaties
    // in de juiste potmaat zodat het voorstel nooit leeg blijft.
    if (items.length === 0 && light) {
      setPickerLight('')
      setPickerLightFallback(true)
      await performSearch({
        group: '275',
        q: '',
        light: '',
        potMin,
        potMax,
      })
    }
  }

  function chooseItem(item: CatalogItem) {
    if (!pickerTarget) return
    const sale = item.suggested_sale_price ?? 0
    const cost = item.cost_price ?? null
    // Standaard zijn de keuzes nu All-in-1 combinaties (groep 275).
    // Mocht er een historisch artikel uit groep 100/300 doorpassen,
    // dan vangen we dat hieronder af zodat het juiste line_type bewaard
    // wordt.
    const lineType: Line['lineType'] =
      item.product_group_code === '275'
        ? 'combination'
        : item.product_group_code === '300'
          ? 'outer_pot'
          : 'plant'
    const base = {
      lineType,
      supplier: 'nieuwkoop' as const,
      itemcode: item.itemcode,
      name: item.description || item.itemcode,
      description: null,
      spec: buildSpec(item) || null,
      imageUrl: item.item_picture_name
        ? `/api/nieuwkoop/image/${encodeURIComponent(item.itemcode)}`
        : null,
      supplierUnitPriceCents: cost != null ? Math.round(cost * 100) : null,
      unitPriceEuro: sale > 0 ? sale.toFixed(2) : '',
      quantity: 1,
    }

    if (pickerTarget.kind === 'extra') {
      setLines((prev) => [
        ...prev,
        { key: nextKey(), slotId: null, ...base },
      ])
    } else {
      const { slotId } = pickerTarget
      setLines((prev) => {
        const idx = prev.findIndex((l) => l.slotId === slotId)
        const line: Line = {
          key: idx >= 0 ? prev[idx].key : nextKey(),
          slotId,
          ...base,
        }
        if (idx >= 0) {
          const copy = [...prev]
          copy[idx] = line
          return copy
        }
        return [...prev, line]
      })
    }
    setPickerTarget(null)
  }

  function addSkipLine(slotId: string, oldPlantName: string) {
    // "Geen vervangingsplant" — vervang elke bestaande slot-regel door
    // een vrije regel met de uitleg, prijs €0. De gebruiker kan de
    // toelichting bewerken.
    setLines((prev) => [
      ...prev.filter((l) => l.slotId !== slotId),
      {
        key: nextKey(),
        slotId,
        lineType: 'custom',
        supplier: null,
        itemcode: null,
        name: `Vervanging voor ${oldPlantName} — niet voorgesteld`,
        description: '',
        spec: null,
        imageUrl: null,
        supplierUnitPriceCents: null,
        unitPriceEuro: '',
        quantity: 1,
      },
    ])
  }

  function addCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        slotId: null,
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
      companyId: selected?.companyId ?? visitPrefill?.companyId ?? null,
      customerName,
      customerEmail,
      introNote,
      validUntil: validUntil || null,
      sourceVisitId: visitPrefill?.visitId ?? null,
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
          <Link
            href={`/quotes/${success.quoteId}`}
            className="stera-cta stera-cta-primary"
          >
            Offerte bekijken
          </Link>
          <Link href="/quotes" className="stera-cta stera-cta-ghost">
            Naar offertes
          </Link>
        </div>
      </div>
    )
  }

  const pickerSlot =
    pickerTarget?.kind === 'slot'
      ? slots.find((s) => s.visitPlantId === pickerTarget.slotId) ?? null
      : null
  const pickerTitle =
    pickerTarget?.kind === 'slot'
      ? `Combinatie kiezen voor ${pickerSlot?.oldPlantName ?? ''}`
      : 'Combinatie kiezen'

  return (
    <div className="space-y-5">
      {/* Klantgegevens */}
      <section className="stera-card space-y-3">
        <p className="stera-eyebrow text-stera-green">Klant</p>
        {visitPrefill ? (
          <p className="rounded-lg bg-stera-cream-deep/50 p-2.5 text-xs text-stera-ink-soft">
            Klantgegevens zijn ingevuld vanuit de onderhoudsbeurt. Pas ze
            gerust aan.
          </p>
        ) : null}
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

      {/* Vervangingen — per te vervangen plant uit het onderhoud */}
      {slots.length > 0 ? (
        <section className="stera-card space-y-3">
          <div>
            <p className="stera-eyebrow text-stera-green">
              Te vervangen planten
            </p>
            <p className="text-sm text-stera-ink-soft">
              Kies per plant een nieuwe hydrocultuur-plant en een passende
              buitenpot.
            </p>
          </div>

          <ul className="space-y-4">
            {slots.map((slot) => {
              const slotLine =
                lines.find((l) => l.slotId === slot.visitPlantId) ?? null

              const chips: string[] = []
              if (slot.light) chips.push(LIGHT_LABEL[slot.light])
              if (slot.potDiameterCm)
                chips.push(`Ø ${slot.potDiameterCm} cm binnenpot`)
              if (slot.heightCm) chips.push(`H ${slot.heightCm} cm`)
              if (slot.isHanging) chips.push('Hangplant')
              if (slot.careLevel) chips.push(CARE_LABEL[slot.careLevel])

              return (
                <li
                  key={slot.visitPlantId}
                  className="rounded-xl border border-stera-green/40 bg-stera-green/5 p-3"
                >
                  <div className="flex gap-3">
                    {slot.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={woImage(slot.photoUrl) || slot.photoUrl}
                        alt={`Laatste situatie van ${slot.oldPlantName}`}
                        className="h-20 w-20 shrink-0 rounded-lg object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-stera-ink">
                          Vervanging voor {slot.oldPlantName}
                        </p>
                        {!slot.wantsReplacement ? (
                          <span className="rounded-full bg-stera-ink/10 px-2 py-0.5 text-[11px] font-medium text-stera-ink-soft">
                            Niet voorgesteld
                          </span>
                        ) : null}
                      </div>
                      {slot.oldPlantSpecies ? (
                        <p className="text-xs text-stera-ink-soft">
                          was: {slot.oldPlantSpecies}
                        </p>
                      ) : null}
                      {slot.currentPotLabel ? (
                        <p className="text-xs text-stera-ink-soft">
                          Huidige pot: {slot.currentPotLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {chips.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {chips.map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-stera-ink-soft"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {slot.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-stera-ink-soft">
                      {slot.notes}
                    </p>
                  ) : null}

                  {/* Vervangings-combinatie */}
                  <div className="mt-3">
                    {slotLine ? (
                      <LineItem
                        line={slotLine}
                        onUpdate={(patch) =>
                          updateLine(slotLine.key, patch)
                        }
                        onRemove={() => removeLine(slotLine.key)}
                        onReplace={() =>
                          openPickerSlot(slot.visitPlantId)
                        }
                      />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openPickerSlot(slot.visitPlantId)}
                          className="stera-cta stera-cta-secondary"
                        >
                          + Kies combinatie
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            addSkipLine(
                              slot.visitPlantId,
                              slot.oldPlantName
                            )
                          }
                          className="stera-cta stera-cta-ghost"
                        >
                          Geen vervanging
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* Extra / vrije regels */}
      <section className="stera-card space-y-3">
        <p className="stera-eyebrow text-stera-green">
          {slots.length > 0 ? 'Extra regels' : 'Offerteregels'}
        </p>

        {extraLines.length === 0 ? (
          <p className="text-sm text-stera-ink-soft">
            {slots.length > 0
              ? 'Voeg hier eventueel extra planten, potten of vrije regels toe.'
              : 'Nog geen regels. Voeg een plant, een buitenpot of een vrije regel toe.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {extraLines.map((l) => (
              <li key={l.key}>
                <LineItem
                  line={l}
                  onUpdate={(patch) => updateLine(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openPickerExtra()}
            className="stera-cta stera-cta-secondary"
          >
            + Combinatie
          </button>
          <button
            type="button"
            onClick={addCustomLine}
            className="stera-cta stera-cta-ghost"
          >
            + Vrije regel
          </button>
        </div>
      </section>

      {/* Catalogus-kiezer — overlay zodat ze altijd in beeld is */}
      {pickerTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
          onClick={() => setPickerTarget(null)}
        >
          <section
            className="my-4 w-full max-w-2xl space-y-3 rounded-2xl bg-white p-4 shadow-xl sm:my-8"
            onClick={(e) => e.stopPropagation()}
          >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-stera-ink">
              {pickerTitle}
            </p>
            <button
              type="button"
              onClick={() => setPickerTarget(null)}
              className="text-xs text-stera-ink-soft hover:text-stera-ink"
            >
              sluiten
            </button>
          </div>

          {pickerSlot && pickerTarget.kind === 'slot' ? (
            <p className="text-xs text-stera-ink-soft">
              Het voorstel houdt rekening met de potmaat en lichtbehoefte
              uit het onderhoud. Pas de filters gerust aan.
            </p>
          ) : null}

          {pickerLightFallback ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              Geen combinaties met exact die lichtbehoefte. Hieronder alle
              combinaties die in de potmaat passen — kies er zelf een
              geschikte uit of pas de filters aan.
            </p>
          ) : null}

          {pickerSizeFallback ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              Geen combinaties in dat maatbereik. Hieronder alle resultaten
              — let op de Ø-maat per combinatie.
            </p>
          ) : null}

          {/* Filters */}
          <div className="grid gap-2 sm:grid-cols-2">
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
              placeholder="Zoek op naam (bv. Kentia)..."
              className="rounded-lg border border-stera-line bg-white p-2 text-sm"
            />
            <select
              value={pickerLight}
              onChange={(e) => setPickerLight(e.target.value)}
              className="rounded-lg border border-stera-line bg-white p-2 text-sm"
            >
              <option value="">Alle lichtbehoeften</option>
              <option value="zon">Zon</option>
              <option value="half-schaduw">Half-schaduw</option>
              <option value="schaduw">Schaduw</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-stera-ink-soft">
              <span className="shrink-0">Pot Ø van</span>
              <input
                type="number"
                inputMode="numeric"
                value={pickerPotMin}
                onChange={(e) => setPickerPotMin(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-2 text-sm"
                placeholder="cm"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-stera-ink-soft">
              <span className="shrink-0">tot</span>
              <input
                type="number"
                inputMode="numeric"
                value={pickerPotMax}
                onChange={(e) => setPickerPotMax(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-2 text-sm"
                placeholder="cm"
              />
            </label>
          </div>
          <div>
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
            <p className="text-xs text-red-600">{pickerError}</p>
          ) : null}

          {pickerTouched &&
          !pickerLoading &&
          !pickerError &&
          pickerResults.length === 0 ? (
            <p className="text-xs text-stera-ink-soft">
              Geen resultaten. Verruim de potmaat of zoek op naam.
            </p>
          ) : null}

          {pickerResults.length > 0 ? (
            <ul className="grid max-h-96 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
              {pickerResults.map((item) => {
                const sale = item.suggested_sale_price ?? 0
                return (
                  <li key={item.itemcode}>
                    <button
                      type="button"
                      onClick={() => chooseItem(item)}
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
          </section>
        </div>
      ) : null}

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
          <Link href="/quotes" className="stera-cta stera-cta-ghost">
            Annuleren
          </Link>
        </div>
      </section>
    </div>
  )
}

function LineItem({
  line,
  onUpdate,
  onRemove,
  onReplace,
}: {
  line: Line
  onUpdate: (patch: Partial<Line>) => void
  onRemove: () => void
  onReplace?: () => void
}) {
  const lineTotal =
    euroToCents(line.unitPriceEuro) * Math.max(1, line.quantity)
  return (
    <div className="rounded-xl border border-stera-line bg-white p-3">
      <div className="flex flex-wrap gap-3">
        {line.imageUrl ? (
          line.itemcode ? (
            <Link
              href={`/catalog/${line.itemcode}`}
              target="_blank"
              title="Details van dit artikel openen"
              className="shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={line.imageUrl}
                alt={line.name}
                className="h-16 w-16 rounded object-cover transition hover:ring-2 hover:ring-stera-green"
              />
            </Link>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={line.imageUrl}
              alt={line.name}
              className="h-16 w-16 shrink-0 rounded object-cover"
            />
          )
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-[10px] text-stera-ink-soft">
            {LINE_TYPE_LABEL[line.lineType]}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <span className="inline-block rounded-full bg-stera-cream-deep px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
            {LINE_TYPE_LABEL[line.lineType]}
          </span>
          {line.lineType === 'custom' ? (
            <>
              <input
                type="text"
                value={line.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="Omschrijving"
                className="w-full rounded-lg border border-stera-line bg-white p-2 text-sm"
              />
              <textarea
                value={line.description ?? ''}
                onChange={(e) =>
                  onUpdate({ description: e.target.value })
                }
                placeholder="Toelichting / opmerking"
                rows={2}
                className="w-full rounded-lg border border-stera-line bg-white p-2 text-sm"
              />
            </>
          ) : line.itemcode ? (
            <Link
              href={`/catalog/${line.itemcode}`}
              target="_blank"
              className="block text-sm font-medium text-stera-ink underline-offset-2 hover:text-stera-green hover:underline"
            >
              {line.name}
            </Link>
          ) : (
            <p className="text-sm font-medium text-stera-ink">{line.name}</p>
          )}
          {line.spec ? (
            <p className="text-xs text-stera-ink-soft">{line.spec}</p>
          ) : null}
          {line.itemcode ? (
            <p className="font-mono text-[11px] text-stera-ink-soft">
              {line.itemcode}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {onReplace ? (
            <button
              type="button"
              onClick={onReplace}
              className="text-xs text-stera-green hover:underline"
            >
              wijzig
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-stera-ink-soft hover:text-red-600"
          >
            verwijderen
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-stera-line pt-3">
        <label className="text-xs text-stera-ink-soft">
          <span className="mb-1 block">Aantal</span>
          <input
            type="number"
            min={1}
            value={line.quantity}
            onChange={(e) =>
              onUpdate({
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
            value={line.unitPriceEuro}
            onChange={(e) => onUpdate({ unitPriceEuro: e.target.value })}
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
    </div>
  )
}
