'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewRoomPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const locationId = params?.id

  const [name, setName] = useState('')
  const [floor, setFloor] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!locationId) return

    setLoading(true)
    setError('')

    const { data, error: insertError } = await supabase
      .from('rooms')
      .insert([
        {
          location_id: locationId,
          name: name.trim(),
          floor: floor.trim() || null,
          notes: notes.trim() || null,
        },
      ])
      .select('id')
      .single()

    if (insertError || !data) {
      setError(insertError?.message || 'Ruimte aanmaken mislukt.')
      setLoading(false)
      return
    }

    router.push(`/rooms/${data.id}`)
    router.refresh()
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">

        <div>
          <p className="stera-eyebrow mb-2">Ruimte</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Nieuwe ruimte</h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Een ruimte is een onderdeel binnen een locatie waar planten staan.
            Bv. receptie, vergaderzaal, lokaal 3.04.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="stera-card space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Naam ruimte
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bijv. Vergaderzaal Picasso"
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Verdieping (optioneel)
            </label>
            <input
              type="text"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="Bijv. Verdieping 3"
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Beschrijving / notities
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              rows={3}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="stera-cta stera-cta-primary disabled:opacity-50"
            >
              {loading ? 'Opslaan...' : 'Ruimte opslaan'}
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
      </div>
    </main>
  )
}
