'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MaintenancePlantRegistrationPage() {
  const router = useRouter()
  const params = useParams<{ id: string; plantId: string }>()
  const supabase = createClient()

  const visitId = params.id
  const plantId = params.plantId

  const [visitTitle, setVisitTitle] = useState('')
  const [locationName, setLocationName] = useState('')
  const [plantName, setPlantName] = useState('')
  const [plantCode, setPlantCode] = useState('')
  const [species, setSpecies] = useState('')
  const [existingVisitPlantId, setExistingVisitPlantId] = useState<string | null>(null)

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
    async function loadData() {
      const { data: visit, error: visitError } = await supabase
        .from('maintenance_visits')
        .select(`
          id,
          title,
          location_id,
          locations (
            id,
            name
          )
        `)
        .eq('id', visitId)
        .single()

      if (visitError || !visit) {
        setError('Kon onderhoudsbeurt niet ophalen.')
        return
      }

      const { data: plant, error: plantError } = await supabase
        .from('plants')
        .select('id, nickname, plant_code, reference_code, species, location_id')
        .eq('id', plantId)
        .single()

      if (plantError || !plant) {
        setError('Kon plant niet ophalen.')
        return
      }

      if (plant.location_id !== visit.location_id) {
        setError('Deze plant hoort niet bij de locatie van deze onderhoudsbeurt.')
        return
      }

      const { data: existingVisitPlant } = await supabase
        .from('maintenance_visit_plants')
        .select('id, notes')
        .eq('visit_id', visitId)
        .eq('plant_id', plantId)
        .maybeSingle()

      setVisitTitle(visit.title || '')
      setLocationName(visit.locations?.name || '')
      setPlantName(plant.nickname || plant.plant_code || plant.reference_code || 'Plant')
      setPlantCode(plant.reference_code || plant.plant_code || '')
      setSpecies(plant.species || '')
      setExistingVisitPlantId(existingVisitPlant?.id || null)
      setNotes(existingVisitPlant?.notes || '')
    }

    if (visitId && plantId) {
      loadData()
    }
  }, [visitId, plantId, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const derivedStatus = isDead
        ? 'dead'
        : needsReplacement || replaced
        ? 'replacement_needed'
        : isDying
        ? 'needs_attention'
        : 'healthy'

      let visitPlantId = existingVisitPlantId

      if (!visitPlantId) {
        const { data: insertedVisitPlant, error: visitPlantInsertError } = await supabase
          .from('maintenance_visit_plants')
          .insert([
            {
              visit_id: visitId,
              plant_id: plantId,
              notes: notes || null,
            },
          ])
          .select('id')
          .single()

        if (visitPlantInsertError || !insertedVisitPlant) {
          throw new Error(visitPlantInsertError?.message || 'Koppelen aan onderhoud mislukt.')
        }

        visitPlantId = insertedVisitPlant.id
        setExistingVisitPlantId(insertedVisitPlant.id)
      } else {
        const { error: visitPlantUpdateError } = await supabase
          .from('maintenance_visit_plants')
          .update({
            notes: notes || null,
          })
          .eq('id', visitPlantId)

        if (visitPlantUpdateError) {
          throw new Error(visitPlantUpdateError.message)
        }
      }

      const { error: logError } = await supabase
        .from('plant_maintenance_logs')
        .insert([
          {
            plant_id: plantId,
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
        throw new Error(logError.message)
      }

      const { error: plantError } = await supabase
        .from('plants')
        .update({
          status: derivedStatus,
          needs_replacement: needsReplacement || replaced,
          is_dying: isDying,
          is_dead: isDead,
        })
        .eq('id', plantId)

      if (plantError) {
        throw new Error(plantError.message)
      }

      await supabase.from('maintenance_visit_logs').insert([
        {
          visit_id: visitId,
          event_type: 'plant_maintained',
          payload: {
            plant_id: plantId,
            maintenance_visit_plant_id: visitPlantId,
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
        },
      ])

      router.push(`/maintenance/${visitId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setLoading(false)
    }
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Onderhoud registreren</h1>
            {visitTitle && (
              <p className="text-sm text-gray-600">Onderhoud: {visitTitle}</p>
            )}
            {locationName && (
              <p className="text-sm text-gray-600">Locatie: {locationName}</p>
            )}
            {plantName && (
              <p className="text-sm text-gray-600">Plant: {plantName}</p>
            )}
            {(species || plantCode) && (
              <p className="text-sm text-gray-600">
                {species || 'Onbekende soort'}
                {plantCode ? ` • ${plantCode}` : ''}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Link
              href={`/maintenance/${visitId}/plants`}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Terug
            </Link>

            <Link
              href={`/maintenance/${visitId}`}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            >
              Onderhoud
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border p-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={watered} onChange={(e) => setWatered(e.target.checked)} />
            Water gegeven
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pruned} onChange={(e) => setPruned(e.target.checked)} />
            Gesnoeid
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={dusted} onChange={(e) => setDusted(e.target.checked)} />
            Stofvrij gemaakt
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rotated} onChange={(e) => setRotated(e.target.checked)} />
            Gedraaid
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={fed} onChange={(e) => setFed(e.target.checked)} />
            Voeding gegeven
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={pestTreated} onChange={(e) => setPestTreated(e.target.checked)} />
            Plagen behandeld
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={repotted} onChange={(e) => setRepotted(e.target.checked)} />
            Verpot
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={soilRefreshed} onChange={(e) => setSoilRefreshed(e.target.checked)} />
            Verse aarde toegevoegd
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={polished} onChange={(e) => setPolished(e.target.checked)} />
            Opgeblonken
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={replaced} onChange={(e) => setReplaced(e.target.checked)} />
            Plant vervangen
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={needsReplacement} onChange={(e) => setNeedsReplacement(e.target.checked)} />
            Moet vervangen worden
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isDying} onChange={(e) => setIsDying(e.target.checked)} />
            Plant is stervend
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isDead} onChange={(e) => setIsDead(e.target.checked)} />
            Plant is dood
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
            disabled={loading}
            className="rounded-lg bg-black px-4 py-3 text-white disabled:opacity-50"
          >
            {loading ? 'Opslaan...' : 'Onderhoud opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
