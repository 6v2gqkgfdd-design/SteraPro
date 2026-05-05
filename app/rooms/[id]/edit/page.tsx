'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function EditRoomPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const roomId = params?.id

  const [name, setName] = useState('')
  const [floor, setFloor] = useState('')
  const [notes, setNotes] = useState('')
  const [locationId, setLocationId] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('rooms')
        .select('name, floor, notes, location_id')
        .eq('id', roomId)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        setError(error?.message || 'Ruimte niet gevonden.')
        setLoading(false)
        return
      }

      setName(data.name ?? '')
      setFloor(data.floor ?? '')
      setNotes(data.notes ?? '')
      setLocationId(data.location_id ?? '')
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [roomId, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!roomId) return

    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('rooms')
      .update({
        name: name.trim(),
        floor: floor.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', roomId)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    router.push(`/rooms/${roomId}`)
    router.refresh()
  }

  async function handleDelete() {
    if (!roomId) return
    const confirmed = window.confirm(
      'Ben je zeker dat je deze ruimte wilt verwijderen? Planten in deze ruimte verliezen hun ruimte-koppeling, maar blijven bestaan op de locatie.'
    )
    if (!confirmed) return

    setDeleting(true)
    setError('')

    const { error } = await supabase.from('rooms').delete().eq('id', roomId)

    if (error) {
      setError(error.message)
      setDeleting(false)
      return
    }

    if (locationId) {
      router.push(`/locations/${locationId}`)
    } else {
      router.push('/dashboard')
    }
    router.refresh()
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/dashboard" className="stera-cta stera-cta-ghost">← Dashboard</Link>

        <div>
          <p className="stera-eyebrow mb-2">Ruimte</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Ruimte bewerken</h1>
        </div>

        {loading ? (
          <p className="text-sm text-stera-ink-soft">Laden...</p>
        ) : (
          <form onSubmit={handleSubmit} className="stera-card space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Naam ruimte
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Verdieping
              </label>
              <input
                type="text"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Notities
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
                disabled={saving}
                className="stera-cta stera-cta-primary disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
              </button>

              <Link
                href={`/rooms/${roomId}`}
                className="stera-cta stera-cta-ghost"
              >
                Annuleren
              </Link>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {deleting ? 'Verwijderen...' : 'Ruimte verwijderen'}
              </button>
            </div>

            {error && <p className="text-red-600">{error}</p>}
          </form>
        )}
      </div>
    </main>
  )
}
