'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewLocationPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const supabase = createClient()

  const [name, setName] = useState('')
  const [floor, setFloor] = useState('')
  const [room, setRoom] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const companyId = params.id

    const { error } = await supabase.from('locations').insert([
      {
        company_id: companyId,
        name,
        floor,
        room,
        notes,
      },
    ])

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(`/companies/${companyId}`)
    router.refresh()
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="stera-eyebrow mb-2">Locatie</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Nieuwe locatie</h1>
        </div>

        <form onSubmit={handleSubmit} className="stera-card space-y-4">
          <input
            type="text"
            placeholder="Naam locatie"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
            required
          />

          <input
            type="text"
            placeholder="Verdieping"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
          />

          <input
            type="text"
            placeholder="Ruimte"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
          />

          <textarea
            placeholder="Notities"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
            rows={4}
          />

          <button
            type="submit"
            disabled={loading}
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
