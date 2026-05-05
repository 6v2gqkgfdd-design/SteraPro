'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function EditPlantPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const plantId = params?.id

  const [nickname, setNickname] = useState('')
  const [species, setSpecies] = useState('')
  const [status, setStatus] = useState('healthy')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!plantId) return
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('plants')
        .select('nickname, species, status, notes')
        .eq('id', plantId)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        setError(error?.message || 'Plant niet gevonden.')
        setLoading(false)
        return
      }

      setNickname(data.nickname ?? '')
      setSpecies(data.species ?? '')
      setStatus(data.status ?? 'healthy')
      setNotes(data.notes ?? '')
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [plantId, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!plantId) return

    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('plants')
      .update({
        nickname: nickname.trim() || null,
        species: species.trim() || null,
        status,
        notes: notes.trim() || null,
      })
      .eq('id', plantId)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    router.push(`/plants/${plantId}`)
    router.refresh()
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">

        <div>
          <p className="stera-eyebrow mb-2">Plant</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Plant bewerken</h1>
        </div>

        {loading ? (
          <p className="text-sm text-stera-ink-soft">Laden...</p>
        ) : (
          <form onSubmit={handleSubmit} className="stera-card space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Bijnaam
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Soort
              </label>
              <input
                type="text"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              >
                <option value="healthy">Gezond</option>
                <option value="needs_attention">Vraagt aandacht</option>
                <option value="maintenance_due">Onderhoud vereist</option>
                <option value="replacement_needed">Vervanging nodig</option>
                <option value="dead">Dood</option>
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
                href={`/plants/${plantId}`}
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
