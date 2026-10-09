'use client'

import { useState } from 'react'
import { createPlantRequest } from './actions'

export default function RequestForm() {
  const [species, setSpecies] = useState('')
  const [quantity, setQuantity] = useState('')
  const [locationNote, setLocationNote] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await createPlantRequest({ species, quantity, locationNote, message })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="rounded-xl border border-stera-green/30 bg-stera-green/5 p-5">
        <p className="font-semibold text-stera-green">Aanvraag ontvangen</p>
        <p className="mt-2 text-sm text-stera-ink-soft">
          Stera Pro bekijkt je vraag. De status blijft op deze pagina zichtbaar.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false)
            setSpecies('')
            setQuantity('')
            setLocationNote('')
            setMessage('')
          }}
          className="mt-4 text-sm text-stera-green hover:underline"
        >
          Nog een aanvraag
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-stera-line bg-white p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="species" className="stera-eyebrow text-stera-ink-soft mb-1 block">
            Welke planten
          </label>
          <input
            id="species"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            maxLength={300}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
            placeholder="bv. Strelitzia, 120 cm"
          />
        </div>
        <div>
          <label htmlFor="quantity" className="stera-eyebrow text-stera-ink-soft mb-1 block">
            Aantal
          </label>
          <input
            id="quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            maxLength={80}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
            placeholder="bv. 3"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="location" className="stera-eyebrow text-stera-ink-soft mb-1 block">
            Locatie of ruimte
          </label>
          <input
            id="location"
            value={locationNote}
            onChange={(e) => setLocationNote(e.target.value)}
            maxLength={300}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
            placeholder="bv. vergaderzaal, eerste verdieping"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="message" className="stera-eyebrow text-stera-ink-soft mb-1 block">
            Toelichting *
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            minLength={3}
            maxLength={2000}
            rows={4}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
            placeholder="Licht, potmaat, gewenste leverdatum, …"
          />
        </div>
      </div>
      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={saving} className="stera-cta stera-cta-primary mt-5 disabled:opacity-60">
        {saving ? 'Versturen…' : 'Aanvraag versturen'}
      </button>
    </form>
  )
}
