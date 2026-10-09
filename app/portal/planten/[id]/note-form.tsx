'use client'

import { useState } from 'react'
import { savePlantNote } from './actions'

export default function PlantNoteForm({ plantId, initial }: { plantId: string; initial: string }) {
  const [note, setNote] = useState(initial)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    const result = await savePlantNote(plantId, note)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage('Notitie bewaard.')
  }

  return (
    <form onSubmit={onSubmit} className="px-5 py-4">
      <label className="stera-eyebrow mb-2 block text-stera-ink-soft" htmlFor="plant-note">
        Jouw notitie
      </label>
      <textarea
        id="plant-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        maxLength={2000}
        className="w-full rounded-xl border border-stera-line bg-white px-3 py-2 text-sm"
        placeholder="Bijvoorbeeld waar de plant staat of wat de receptie moet weten."
      />
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-2 text-sm text-stera-green">{message}</p> : null}
      <button type="submit" disabled={loading} className="stera-cta stera-cta-primary mt-3 disabled:opacity-60">
        {loading ? 'Bewaren…' : 'Notitie bewaren'}
      </button>
    </form>
  )
}
