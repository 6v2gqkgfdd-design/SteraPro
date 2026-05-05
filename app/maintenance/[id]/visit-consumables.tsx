'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type CatalogItem = {
  id: string
  name: string
  default_unit: string | null
  active: boolean
  sort_order: number | null
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
  } | null
}

const CUSTOM_OPTION = '__custom__'

export default function VisitConsumables({ visitId }: { visitId: string }) {
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

  async function loadAll() {
    setLoading(true)
    setError('')

    try {
      const [catalogResult, itemsResult] = await Promise.all([
        supabase
          .from('consumable_catalog')
          .select('id, name, default_unit, active, sort_order')
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
              default_unit
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
      // keep custom_name and unit as the user is editing
      return
    }

    const item = catalog.find((c) => c.id === value)
    if (item) {
      setCustomName('')
      if (item.default_unit) {
        setUnit(item.default_unit)
      }
    }
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
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toevoegen mislukt.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(itemId: string) {
    const confirmed = window.confirm('Verbruiksgoed verwijderen?')
    if (!confirmed) return

    setError('')

    const { error: deleteError } = await supabase
      .from('maintenance_visit_consumables')
      .delete()
      .eq('id', itemId)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

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
        <h2 className="font-semibold">Verbruiksgoederen</h2>
        <p className="text-sm text-gray-600">
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
        <ul className="space-y-2">
          {items.map((item) => (
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
                {item.notes && (
                  <p className="mt-1 text-sm text-gray-700">{item.notes}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="text-sm text-red-600 underline"
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}

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
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.default_unit ? ` (${c.default_unit})` : ''}
            </option>
          ))}
          <option value={CUSTOM_OPTION}>Andere...</option>
        </select>

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
    </div>
  )
}
