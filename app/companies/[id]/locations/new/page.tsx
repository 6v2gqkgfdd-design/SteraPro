'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewLocationPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const supabase = createClient()

  const companyId = params?.id

  const [name, setName] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('BE')
  const [notes, setNotes] = useState('')
  const [firstRoomName, setFirstRoomName] = useState('Hoofdruimte')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyId) return

    setLoading(true)
    setError('')

    try {
      const { data: locationData, error: locationError } = await supabase
        .from('locations')
        .insert([
          {
            company_id: companyId,
            name: name.trim(),
            street: street.trim() || null,
            number: number.trim() || null,
            postal_code: postalCode.trim() || null,
            city: city.trim() || null,
            country: country.trim() || null,
            notes: notes.trim() || null,
          },
        ])
        .select('id')
        .single()

      if (locationError || !locationData) {
        throw new Error(locationError?.message || 'Locatie opslaan mislukt.')
      }

      // Maak meteen één eerste ruimte zodat planten ergens kunnen landen.
      const initialRoom = firstRoomName.trim() || 'Hoofdruimte'
      const { error: roomError } = await supabase.from('rooms').insert([
        {
          location_id: locationData.id,
          name: initialRoom,
        },
      ])

      if (roomError) {
        throw new Error(roomError.message)
      }

      router.push(`/locations/${locationData.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setLoading(false)
    }
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={`/companies/${companyId}`}
          className="text-sm text-stera-blue underline"
        >
          ← Terug naar bedrijf
        </Link>

        <div>
          <p className="stera-eyebrow mb-2">Locatie</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Nieuwe locatie</h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Een locatie is een fysiek adres. Binnen een locatie kan je later
            meerdere ruimtes aanmaken (receptie, vergaderzaal, lokaal X, …).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="stera-card space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-blue">
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
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-blue">
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
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-blue">
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
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-blue">
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
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-blue">
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
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-blue">
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
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-blue">
              Eerste ruimte
            </label>
            <input
              type="text"
              value={firstRoomName}
              onChange={(e) => setFirstRoomName(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              placeholder="Bijv. Receptie"
            />
            <p className="text-xs text-stera-ink-soft">
              Wordt automatisch aangemaakt zodat je meteen planten kan toevoegen.
              Andere ruimtes voeg je later toe via de locatiepagina.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-blue">
              Algemene notities
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              rows={4}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="stera-cta stera-cta-primary disabled:opacity-50"
          >
            {loading ? 'Opslaan...' : 'Locatie opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
