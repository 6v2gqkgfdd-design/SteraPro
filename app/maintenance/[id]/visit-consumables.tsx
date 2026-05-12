'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { formatEur } from '@/lib/pot-sizes'
import { ConfirmModal } from '@/components/confirm-modal'

type CatalogItem = {
  id: string
  name: string
  default_unit: string | null
  active: boolean
  sort_order: number | null
  unit_size: number | null
  unit_price_cents: number | null
  default_quantity: number | null
  description: string | null
}

type VisitConsumable = {
  id: string
  visit_id: string
  catalog_item_id: string | null
  custom_name: string | null
  quantity: number
  unit: string | null
  notes: string | null
  consumable_catalog: {
    id: string
    name: string
    default_unit: string | null
    unit_size: number | null
    unit_price_cents: number | null
  } | null
}

const CUSTOM_OPTION = '__custom__'

/**
 * Verwijder alle interne `[auto:*]`-markers uit notes, zodat we ze
 * niet aan Jelle tonen. Worden gezet door recomputeAutoConsumables
 * (verpot-aggregaten, standaard bladglans/voeding, neemolie bij
 * zieke planten).
 */
function cleanNotes(value: string | null): string | null {
  if (!value) return null
  const cleaned = value.replace(/\s*\[auto:[^\]]+\]\s*/g, ' ').trim()
  return cleaned || null
}

export default function VisitConsumables({
  visitId,
  locked = false,
}: {
  visitId: string
  locked?: boolean
}) {
  const supabase = createClient()

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [items, setItems] = useState<VisitConsumable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // form state
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('')
  const [customName, setCustomName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setError('')

    try {
      const [catalogResult, itemsResult] = await Promise.all([
        supabase
          .from('consumable_catalog')
          .select(
            'id, name, default_unit, active, sort_order, unit_size, unit_price_cents, default_quantity, description'
          )
          .eq('active', true)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('maintenance_visit_consumables')
          .select(
            `
            id,
            visit_id,
            catalog_item_id,
            custom_name,
            quantity,
            unit,
            notes,
            consumable_catalog (
              id,
              name,
              default_unit,
              unit_size,
              unit_price_cents
            )
            `
          )
          .eq('visit_id', visitId)
          .order('created_at', { ascending: true }),
      ])

      if (catalogResult.error) throw new Error(catalogResult.error.message)
      if (itemsResult.error) throw new Error(itemsResult.error.message)

      setCatalog((catalogResult.data ?? []) as CatalogItem[])
      const rawItems = (itemsResult.data ?? []) as unknown as Array<
        VisitConsumable & {
          consumable_catalog:
            | VisitConsumable['consumable_catalog']
            | VisitConsumable['consumable_catalog'][]
            | null
        }
      >
      const normalized: VisitConsumable[] = rawItems.map((row) => ({
        ...row,
        consumable_catalog: Array.isArray(row.consumable_catalog)
          ? row.consumable_catalog[0] ?? null
          : row.consumable_catalog,
      }))
      setItems(normalized)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon verbruik niet laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId])

  function handleCatalogChange(value: string) {
    setSelectedCatalogId(value)

    if (value === CUSTOM_OPTION || value === '') {
      return
    }

    const item = catalog.find((c) => c.id === value)
    if (item) {
      setCustomName('')
      if (item.default_unit) {
        setUnit(item.default_unit)
      }
      if (item.default_quantity != null && quantity === '') {
        setQuantity(String(item.default_quantity))
      }
    }
  }

  function selectedCatalogItem(): CatalogItem | null {
    return catalog.find((c) => c.id === selectedCatalogId) ?? null
  }

  function lineTotalCents(item: VisitConsumable): number | null {
    const cat = item.consumable_catalog as
      | (VisitConsumable['consumable_catalog'] & {
          unit_size?: number | null
          unit_price_cents?: number | null
        })
      | null
    const unitSize = cat?.unit_size ?? null
    const unitPrice = cat?.unit_price_cents ?? null
    if (!unitSize || !unitPrice || unitSize <= 0) return null
    return Math.round((Number(item.quantity) / unitSize) * unitPrice)
  }

  function resetForm() {
    setSelectedCatalogId('')
    setCustomName('')
    setQuantity('')
    setUnit('')
    setNotes('')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (locked) {
      setError('Werkbon staat vast — geen wijzigingen meer mogelijk.')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      const isCustom = selectedCatalogId === CUSTOM_OPTION
      const isCatalog = !isCustom && selectedCatalogId !== ''

      if (!isCustom && !isCatalog) {
        throw new Error('Kies een verbruiksgoed of selecteer "Andere..."')
      }

      const trimmedCustom = customName.trim()
      if (isCustom && !trimmedCustom) {
        throw new Error('Geef een naam in voor het andere verbruiksgoed.')
      }

      const parsedQuantity = parseFloat(quantity.replace(',', '.'))
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
        throw new Error('Geef een geldige hoeveelheid in (groter dan 0).')
      }

      const trimmedUnit = unit.trim() || null
      const trimmedNotes = notes.trim() || null

      const payload = {
        visit_id: visitId,
        catalog_item_id: isCatalog ? selectedCatalogId : null,
        custom_name: isCustom ? trimmedCustom : null,
        quantity: parsedQuantity,
        unit: trimmedUnit,
        notes: trimmedNotes,
      }

      const { error: insertError } = await supabase
        .from('maintenance_visit_consumables')
        .insert([payload])

      if (insertError) throw new Error(insertError.message)

      resetForm()
      toast.success('Verbruiksgoed toegevoegd')
      await loadAll()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Toevoegen mislukt.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(itemId: string) {
    if (locked) {
      toast.error('Werkbon staat vast — geen wijzigingen meer mogelijk.')
      return
    }

    setError('')

    const { error: deleteError } = await supabase
      .from('maintenance_visit_consumables')
      .delete()
      .eq('id', itemId)

    if (deleteError) {
      toast.error(deleteError.message)
      return
    }
    toast.success('Verwijderd')

    await loadAll()
  }

  function displayName(item: VisitConsumable) {
    if (item.custom_name) return item.custom_name
    if (item.consumable_catalog?.name) return item.consumable_catalog.name
    return 'Onbekend'
  }

  function formatQuantity(value: number) {
    if (Number.isInteger(value)) return value.toString()
    return value.toFixed(2).replace(/\.?0+$/, '')
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="stera-eyebrow">Verbruiksgoederen</p>
        <p className="mt-1 text-sm text-stera-ink-soft">
          Wat heb je tijdens deze beurt gebruikt? Komt mee in het rapport voor de klant.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Laden...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nog geen verbruiksgoederen geregistreerd.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => {
              const total = lineTotalCents(item)
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {displayName(item)}{' '}
                      <span className="font-normal text-gray-600">
                        — {formatQuantity(item.quantity)}
                        {item.unit ? ` ${item.unit}` : ''}
                      </span>
                    </p>
                    {(() => {
                      const visibleNotes = cleanNotes(item.notes)
                      return visibleNotes ? (
                        <p className="mt-1 text-sm text-gray-700">
                          {visibleNotes}
                        </p>
                      ) : null
                    })()}
                  </div>
                  <div className="flex items-baseline gap-3">
                    {total != null ? (
                      <span className="text-sm font-medium text-stera-ink">
                        {formatEur(total)}
                      </span>
                    ) : null}
                    {!locked ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="text-sm text-red-600 underline"
                      >
                        Verwijderen
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          {(() => {
            const totals = items
              .map(lineTotalCents)
              .filter((t): t is number => t != null)
            if (totals.length === 0) return null
            const sum = totals.reduce((a, b) => a + b, 0)
            return (
              <p className="text-right text-sm font-semibold text-stera-ink">
                Totaal: {formatEur(sum)}
              </p>
            )
          })()}
        </>
      )}

      {locked ? (
        <div className="rounded-lg border border-stera-green/40 bg-stera-green/5 p-3 text-sm text-stera-green">
          Werkbon staat vast — geen wijzigingen meer mogelijk aan deze
          verbruikslijst.
        </div>
      ) : (
      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-lg border bg-gray-50 p-4"
      >
        <p className="text-sm font-medium">Verbruiksgoed toevoegen</p>

        <select
          value={selectedCatalogId}
          onChange={(e) => handleCatalogChange(e.target.value)}
          className="w-full rounded-lg border bg-white p-3"
          required
        >
          <option value="">Kies een verbruiksgoed</option>
          {catalog.map((c) => {
            const price =
              c.unit_size && c.unit_price_cents
                ? ` — ${formatEur(c.unit_price_cents)} per ${c.unit_size} ${c.default_unit ?? ''}`.trimEnd()
                : c.default_unit
                  ? ` (${c.default_unit})`
                  : ''
            return (
              <option key={c.id} value={c.id}>
                {c.name}
                {price}
              </option>
            )
          })}
          <option value={CUSTOM_OPTION}>Andere...</option>
        </select>

        {(() => {
          const sel = selectedCatalogItem()
          if (!sel || !sel.unit_price_cents) return null
          return (
            <p className="text-xs text-stera-ink-soft">
              {sel.description ?? ''}
              {sel.description ? ' · ' : ''}
              {formatEur(sel.unit_price_cents)} per {sel.unit_size}{' '}
              {sel.default_unit ?? ''}
            </p>
          )
        })()}

        {selectedCatalogId === CUSTOM_OPTION && (
          <input
            type="text"
            placeholder="Naam (bv. Vloeibare meststof Plagron)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="w-full rounded-lg border bg-white p-3"
            required
          />
        )}

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Hoeveelheid"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border bg-white p-3"
            required
          />
          <input
            type="text"
            placeholder="Eenheid (L, ml, stuk, ...)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border bg-white p-3"
          />
        </div>

        <textarea
          placeholder="Optionele opmerking (bv. type/merk, locatie in de ruimte, …)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border bg-white p-3"
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {submitting ? 'Toevoegen...' : 'Toevoegen'}
          </button>
          {selectedCatalogId !== '' && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border px-4 py-2"
            >
              Wissen
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </form>
      )}

      <ConfirmModal
        open={confirmDeleteId !== null}
        title="Verbruiksgoed verwijderen?"
        description="Deze regel wordt definitief verwijderd uit deze beurt."
        confirmLabel="Verwijderen"
        tone="danger"
        onConfirm={async () => {
          const id = confirmDeleteId
          setConfirmDeleteId(null)
          if (id) await handleDelete(id)
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}
