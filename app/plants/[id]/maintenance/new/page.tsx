'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewMaintenancePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const supabase = createClient()

  const [plantName, setPlantName] = useState('')
  const [watered, setWatered] = useState(false)
  const [pruned, setPruned] = useState(false)
  const [dusted, setDusted] = useState(false)
  const [rotated, setRotated] = useState(false)
  const [fed, setFed] = useState(false)
  const [pestTreated, setPestTreated] = useState(false)
  const [repotted, setRepotted] = useState(false)
  const [soilRefreshed, setSoilRefreshed] = useState(false)
  const [polished, setPolished] = useState(false)
  const [replaced, setReplaced] = useState(false)
  const [needsReplacement, setNeedsReplacement] = useState(false)
  const [isDying, setIsDying] = useState(false)
  const [isDead, setIsDead] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadPlant() {
      const { data, error } = await supabase
        .from('plants')
        .select('id, nickname, plant_code')
        .eq('id', params.id)
        .single()

      if (error || !data) {
        setError('Kon plant niet ophalen.')
        return
      }

      setPlantName(data.nickname || data.plant_code || 'Plant')
    }

    loadPlant()
  }, [params.id, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const derivedStatus = isDead
      ? 'dead'
      : needsReplacement || replaced
      ? 'replacement_needed'
      : isDying
      ? 'needs_attention'
      : 'healthy'

    const { error: logError } = await supabase
      .from('plant_maintenance_logs')
      .insert([
        {
          plant_id: params.id,
          watered,
          pruned,
          dusted,
          rotated,
          fed,
          pest_treated: pestTreated,
          repotted,
          soil_refreshed: soilRefreshed,
          polished,
          replaced,
          needs_replacement: needsReplacement,
          is_dying: isDying,
          is_dead: isDead,
          notes: notes || null,
        },
      ])

    if (logError) {
      setError(logError.message)
      setLoading(false)
      return
    }

    const { error: plantError } = await supabase
      .from('plants')
      .update({
        status: derivedStatus,
        needs_replacement: needsReplacement || replaced,
        is_dying: isDying,
        is_dead: isDead,
      })
      .eq('id', params.id)

    if (plantError) {
      setError(plantError.message)
      setLoading(false)
      return
    }

    router.push(`/plants/${params.id}`)
    router.refresh()
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-2 text-2xl font-bold">Onderhoud registreren</h1>
        {plantName && (
          <p className="mb-6 text-sm text-gray-600">
            Plant: {plantName}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border p-6">
          <label className="flex items-center gap-2"><input type="checkbox" checked={watered} onChange={(e) => setWatered(e.target.checked)} /> Water gegeven</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={pruned} onChange={(e) => setPruned(e.target.checked)} /> Gesnoeid</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={dusted} onChange={(e) => setDusted(e.target.checked)} /> Stofvrij gemaakt</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={rotated} onChange={(e) => setRotated(e.target.checked)} /> Gedraaid</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={fed} onChange={(e) => setFed(e.target.checked)} /> Voeding gegeven</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={pestTreated} onChange={(e) => setPestTreated(e.target.checked)} /> Plagen behandeld</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={repotted} onChange={(e) => setRepotted(e.target.checked)} /> Verpot</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={soilRefreshed} onChange={(e) => setSoilRefreshed(e.target.checked)} /> Verse aarde toegevoegd</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={polished} onChange={(e) => setPolished(e.target.checked)} /> Opgeblonken</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={replaced} onChange={(e) => setReplaced(e.target.checked)} /> Plant vervangen</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={needsReplacement} onChange={(e) => setNeedsReplacement(e.target.checked)} /> Moet vervangen worden</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={isDying} onChange={(e) => setIsDying(e.target.checked)} /> Plant is stervend</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={isDead} onChange={(e) => setIsDead(e.target.checked)} /> Plant is dood</label>

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
            {loading ? 'Opslaan...' : 'Onderhoud opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
