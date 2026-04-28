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
    <main className="p-6">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold mb-6">Nieuwe locatie</h1>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-6">
          <input
            type="text"
            placeholder="Naam locatie"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border p-3"
            required
          />

          <input
            type="text"
            placeholder="Verdieping"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="w-full rounded-lg border p-3"
          />

          <input
            type="text"
            placeholder="Ruimte"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="w-full rounded-lg border p-3"
          />

          <textarea
            placeholder="Notities"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border p-3"
            rows={4}
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black px-4 py-3 text-white"
          >
            {loading ? 'Opslaan...' : 'Locatie opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
