'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewMaintenancePage() {
  const supabase = createClient()
  const router = useRouter()

  const [locations, setLocations] = useState<any[]>([])
  const [locationId, setLocationId] = useState('')
  const [title, setTitle] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [plannedTasks, setPlannedTasks] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadLocations() {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name, company_id')
        .order('name')

      if (error) {
        setError(error.message)
        return
      }

      setLocations(data || [])
    }

    loadLocations()
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const selectedLocation = locations.find((loc) => loc.id === locationId)

      if (!selectedLocation) {
        throw new Error('Kies eerst een locatie.')
      }

      const { data: previousVisit } = await supabase
        .from('maintenance_visits')
        .select('general_notes, planned_tasks, ended_at')
        .eq('location_id', locationId)
        .eq('status', 'completed')
        .order('ended_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data, error } = await supabase
        .from('maintenance_visits')
        .insert([
          {
            company_id: selectedLocation.company_id,
            location_id: locationId,
            title,
            scheduled_start: new Date(scheduledStart).toISOString(),
            planned_tasks: plannedTasks || null,
            access_notes: accessNotes || null,
            internal_notes: internalNotes || null,
            previous_visit_summary: previousVisit?.general_notes || null,
            previous_visit_actions: previousVisit?.planned_tasks || null,
          },
        ])
        .select('id')
        .single()

      if (error) {
        throw new Error(error.message)
      }

      router.push(`/maintenance/${data.id}`)
      router.refresh()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setLoading(false)
    }
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold">Nieuwe onderhoudsafspraak</h1>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-6">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-lg border p-3"
            required
          >
            <option value="">Kies een locatie</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Titel van het onderhoud"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border p-3"
            required
          />

          <input
            type="datetime-local"
            value={scheduledStart}
            onChange={(e) => setScheduledStart(e.target.value)}
            className="w-full rounded-lg border p-3"
            required
          />

          <textarea
            placeholder="Geplande taken"
            value={plannedTasks}
            onChange={(e) => setPlannedTasks(e.target.value)}
            rows={4}
            className="w-full rounded-lg border p-3"
          />

          <textarea
            placeholder="Toegang / praktische info"
            value={accessNotes}
            onChange={(e) => setAccessNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border p-3"
          />

          <textarea
            placeholder="Interne opmerkingen"
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border p-3"
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black px-4 py-3 text-white"
          >
            {loading ? 'Opslaan...' : 'Afspraak opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
