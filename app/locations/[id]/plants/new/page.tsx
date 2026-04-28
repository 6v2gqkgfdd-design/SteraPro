'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function NewPlantPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const supabase = createClient()

  const [locationName, setLocationName] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [nickname, setNickname] = useState('')
  const [plantCode, setPlantCode] = useState('')
  const [species, setSpecies] = useState('')
  const [status, setStatus] = useState('healthy')
  const [needsReplacement, setNeedsReplacement] = useState(false)
  const [isDying, setIsDying] = useState(false)
  const [isDead, setIsDead] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadLocation() {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name, company_id')
        .eq('id', params.id)
        .single()

      if (error || !data) {
        setError('Kon locatie niet ophalen.')
        return
      }

      setLocationName(data.name)
      setCompanyId(data.company_id)
    }

    loadLocation()
  }, [params.id, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const baseValue =
      plantCode.trim() || nickname.trim() || `plant-${Date.now()}`
    const qrSlug = slugify(baseValue)

    const { error } = await supabase.from('plants').insert([
      {
        company_id: companyId,
        location_id: params.id,
        plant_code: plantCode || null,
        nickname: nickname || null,
        species: species || null,
        status,
        needs_replacement: needsReplacement,
        is_dying: isDying,
        is_dead: isDead,
        notes: notes || null,
        qr_slug: qrSlug,
      },
    ])

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(`/locations/${params.id}`)
    router.refresh()
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-2 text-2xl font-bold">Nieuwe plant</h1>
        {locationName && (
          <p className="mb-6 text-sm text-gray-600">
            Locatie: {locationName}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-6">
          <input
            type="text"
            placeholder="Bijnaam / plantnaam"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-lg border p-3"
          />

          <input
            type="text"
            placeholder="Plantcode"
            value={plantCode}
            onChange={(e) => setPlantCode(e.target.value)}
            className="w-full rounded-lg border p-3"
          />

          <input
            type="text"
            placeholder="Soort"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            className="w-full rounded-lg border p-3"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border p-3"
          >
            <option value="healthy">Healthy</option>
            <option value="needs_attention">Needs attention</option>
            <option value="maintenance_due">Maintenance due</option>
            <option value="replacement_needed">Replacement needed</option>
            <option value="dead">Dead</option>
          </select>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={needsReplacement}
              onChange={(e) => setNeedsReplacement(e.target.checked)}
            />
            Needs replacement
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isDying}
              onChange={(e) => setIsDying(e.target.checked)}
            />
            Is dying
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isDead}
              onChange={(e) => setIsDead(e.target.checked)}
            />
            Is dead
          </label>

          <textarea
            placeholder="Notities"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border p-3"
            rows={4}
          />

          <button
            type="submit"
            disabled={loading || !companyId}
            className="rounded-lg bg-black px-4 py-3 text-white"
          >
            {loading ? 'Opslaan...' : 'Plant opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
