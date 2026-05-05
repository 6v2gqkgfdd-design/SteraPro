'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function EditLocationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const locationId = params?.id

  const [name, setName] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('BE')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!locationId) return

    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('locations')
        .select('name, street, number, postal_code, city, country, notes')
        .eq('id', locationId)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        setError(error?.message || 'Locatie niet gevonden.')
        setLoading(false)
        return
      }

      setName(data.name ?? '')
      setStreet(data.street ?? '')
      setNumber(data.number ?? '')
      setPostalCode(data.postal_code ?? '')
      setCity(data.city ?? '')
      setCountry(data.country ?? 'BE')
      setNotes(data.notes ?? '')
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [locationId, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!locationId) return

    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('locations')
      .update({
        name: name.trim(),
        street: street.trim() || null,
        number: number.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', locationId)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    router.push(`/locations/${locationId}`)
    router.refresh()
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={`/locations/${locationId}`}
          className="text-sm text-stera-green underline"
        >
          ← Terug naar locatie
        </Link>

        <div>
          <p className="stera-eyebrow mb-2">Locatie</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Locatie bewerken</h1>
        </div>

        {loading ? (
          <p className="text-sm text-stera-ink-soft">Laden...</p>
        ) : (
          <form onSubmit={handleSubmit} className="stera-card space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Naam locatie
              </label>
              <input
                type="text"
                placeholder="Bijv. Hoofdkantoor Brugge"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Straat
                </label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full rounded-lg border border-stera-line bg-white p-3"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Nummer
                </label>
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className="w-full rounded-lg border border-stera-line bg-white p-3"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Postcode
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full rounded-lg border border-stera-line bg-white p-3"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                  Stad
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-lg border border-stera-line bg-white p-3"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Land
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              >
                <option value="BE">België</option>
                <option value="NL">Nederland</option>
                <option value="FR">Frankrijk</option>
                <option value="LU">Luxemburg</option>
                <option value="DE">Duitsland</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Notities
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
                rows={4}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="stera-cta stera-cta-primary disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
              </button>
              <Link
                href={`/locations/${locationId}`}
                className="stera-cta stera-cta-ghost"
              >
                Annuleren
              </Link>
            </div>

            {error && <p className="text-red-600">{error}</p>}
          </form>
        )}
      </div>
    </main>
  )
}
