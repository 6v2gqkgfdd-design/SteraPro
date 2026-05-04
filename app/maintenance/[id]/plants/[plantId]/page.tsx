'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MaintenancePlantDetailPage() {
  const params = useParams<{ id: string; plantId: string }>()
  const router = useRouter()
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
  const [fed, setFed] = useState(false)
  const [cleaned, setCleaned] = useState(false)
  const [rotated, setRotated] = useState(false)
  const [replaced, setReplaced] = useState(false)
  const [checked, setChecked] = useState(true)
  const [healthStatus, setHealthStatus] = useState('healthy')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError('')

      const [{ data: visit, error: visitError }, { data: plant, error: plantError }, { data: existingVisitPlant, error: visitPlantError }] =
        await Promise.all([
          supabase
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
            .single(),

          supabase
            .from('plants')
            .select(`
              id,
              nickname,
              plant_code,
              reference_code,
              species,
              status,
              notes,
              location_id
            `)
            .eq('id', plantId)
            .single(),

          supabase
            .from('maintenance_visit_plants')
            .select('*')
            .eq('visit_id', visitId)
            .eq('plant_id', plantId)
            .maybeSingle(),
        ])

      if (visitError || !visit) {
        setError('Onderhoudsbeurt niet gevonden.')
        setLoading(false)
        return
      }

      if (plantError || !plant) {
        setError('Plant niet gevonden.')
        setLoading(false)
        return
      }

      if (plant.location_id !== visit.location_id) {
        setError('Deze plant hoort niet bij de locatie van deze onderhoudsbeurt.')
        setLoading(false)
        return
      }

      const locationData = visit.locations as any
      const resolvedLocationName = Array.isArray(locationData)
        ? (locationData[0]?.name || '')
        : (locationData?.name || '')

      setVisitTitle(visit.title || '')
      setLocationName(resolvedLocationName)
      setPlantName(
        plant.nickname || plant.plant_code || plant.reference_code || 'Plant'
      )
      setPlantCode(plant.reference_code || plant.plant_code || '')
      setSpecies(plant.species || '')
      setExistingVisitPlantId(existingVisitPlant?.id || null)

      if (visitPlantError) {
        setError('Kon bestaand onderhoud voor deze plant niet ophalen.')
      }

      if (existingVisitPlant) {
        setNotes(existingVisitPlant.notes || '')
        setWatered(Boolean(existingVisitPlant.watered))
        setPruned(Boolean(existingVisitPlant.pruned))
        setFed(Boolean(existingVisitPlant.fed))
        setCleaned(Boolean(existingVisitPlant.cleaned))
        setRotated(Boolean(existingVisitPlant.rotated))
        setReplaced(Boolean(existingVisitPlant.replaced))
        setChecked(
          typeof existingVisitPlant.checked === 'boolean'
            ? existingVisitPlant.checked
            : true
        )
        setHealthStatus(existingVisitPlant.health_status || plant.status || 'healthy')
      } else {
        setNotes('')
        setWatered(false)
        setPruned(false)
        setFed(false)
        setCleaned(false)
        setRotated(false)
        setReplaced(false)
        setChecked(true)
        setHealthStatus(plant.status || 'healthy')
      }

      setLoading(false)
    }

    if (visitId && plantId) {
      loadData()
    }
  }, [visitId, plantId, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const payload = {
        visit_id: visitId,
        plant_id: plantId,
        notes: notes.trim() || null,
        watered,
        pruned,
        fed,
        cleaned,
        rotated,
        replaced,
        checked,
        health_status: healthStatus,
      }

      if (existingVisitPlantId) {
        const { error } = await supabase
          .from('maintenance_visit_plants')
          .update(payload)
          .eq('id', existingVisitPlantId)

        if (error) {
          throw error
        }
      } else {
        const { data, error } = await supabase
          .from('maintenance_visit_plants')
          .insert([payload])
          .select('id')
          .single()

        if (error) {
          throw error
        }

        setExistingVisitPlantId(data.id)
      }

      const { error: plantUpdateError } = await supabase
        .from('plants')
        .update({
          status: healthStatus,
          notes: notes.trim() || null,
        })
        .eq('id', plantId)

      if (plantUpdateError) {
        throw plantUpdateError
      }

      router.push(`/maintenance/${visitId}`)
      router.refresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="p-6">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm text-gray-600">Plantgegevens laden...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Onderhoud registreren</h1>
            <p className="text-sm text-gray-600">Onderhoud: {visitTitle}</p>
            <p className="text-sm text-gray-600">Locatie: {locationName}</p>
            <p className="text-sm text-gray-600">
              Plant: {plantName}
              {plantCode ? ` (${plantCode})` : ''}
            </p>
            {species && (
              <p className="text-sm text-gray-600">Soort: {species}</p>
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
              href="/dashboard"
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>Plant gecontroleerd</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={watered}
                onChange={(e) => setWatered(e.target.checked)}
              />
              <span>Water gegeven</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={pruned}
                onChange={(e) => setPruned(e.target.checked)}
              />
              <span>Gesnoeid</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={fed}
                onChange={(e) => setFed(e.target.checked)}
              />
              <span>Voeding toegevoegd</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={cleaned}
                onChange={(e) => setCleaned(e.target.checked)}
              />
              <span>Bladeren gereinigd</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={rotated}
                onChange={(e) => setRotated(e.target.checked)}
              />
              <span>Gedraaid</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={replaced}
                onChange={(e) => setReplaced(e.target.checked)}
              />
              <span>Vervangen</span>
            </label>
          </div>

          <div className="space-y-2">
            <label htmlFor="health_status" className="block text-sm font-medium">
              Status na onderhoud
            </label>
            <select
              id="health_status"
              value={healthStatus}
              onChange={(e) => setHealthStatus(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="healthy">Healthy</option>
              <option value="needs_attention">Needs attention</option>
              <option value="maintenance_due">Maintenance due</option>
              <option value="replacement_needed">Replacement needed</option>
              <option value="dead">Dead</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="block text-sm font-medium">
              Onderhoudsnotities
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="Bijv. water gegeven, bladeren gereinigd, voeding toegevoegd..."
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Onderhoud opslaan'}
            </button>

            <Link
              href={`/maintenance/${visitId}`}
              className="rounded-lg border px-4 py-2"
            >
              Annuleren
            </Link>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </form>
      </div>
    </main>
  )
}
