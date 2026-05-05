'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Company = {
  id: string
  name: string
}

type Location = {
  id: string
  name: string
  company_id: string
  floor: string | null
  room: string | null
}

export default function NewMaintenancePage() {
  const supabase = createClient()
  const router = useRouter()

  const [companies, setCompanies] = useState<Company[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [loadingLocations, setLoadingLocations] = useState(false)

  const [companyId, setCompanyId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [title, setTitle] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [plannedTasks, setPlannedTasks] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load companies once
  useEffect(() => {
    async function loadCompanies() {
      setLoadingCompanies(true)
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) {
        setError(error.message)
        setLoadingCompanies(false)
        return
      }

      setCompanies((data ?? []) as Company[])
      setLoadingCompanies(false)
    }

    loadCompanies()
  }, [supabase])

  // Load locations whenever company changes
  useEffect(() => {
    if (!companyId) {
      setLocations([])
      setLocationId('')
      return
    }

    let cancelled = false

    async function loadLocations() {
      setLoadingLocations(true)

      const { data, error } = await supabase
        .from('locations')
        .select('id, name, company_id, floor, room')
        .eq('company_id', companyId)
        .order('name', { ascending: true })

      if (cancelled) return

      if (error) {
        setError(error.message)
        setLoadingLocations(false)
        return
      }

      setLocations((data ?? []) as Location[])
      setLocationId('')
      setLoadingLocations(false)
    }

    loadLocations()

    return () => {
      cancelled = true
    }
  }, [companyId, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (!companyId) throw new Error('Kies eerst een klant.')
      if (!locationId) throw new Error('Kies een locatie.')

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
            company_id: companyId,
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

  const noCompanies = !loadingCompanies && companies.length === 0
  const noLocations =
    !!companyId && !loadingLocations && locations.length === 0

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="stera-display text-3xl sm:text-4xl">Nieuwe afspraak</h1>
        </div>

        <form onSubmit={handleSubmit} className="stera-card space-y-5">
          {/* Step 1 — klant */}
          <div className="space-y-1">
            <label htmlFor="company" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              1 · Klant
            </label>
            <select
              id="company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              required
              disabled={loadingCompanies || noCompanies}
            >
              <option value="">
                {loadingCompanies
                  ? 'Klanten laden...'
                  : noCompanies
                    ? 'Nog geen klanten beschikbaar'
                    : 'Kies een klant'}
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {noCompanies && (
              <p className="text-xs text-stera-ink-soft">
                Voeg eerst een klant toe via het menu.
              </p>
            )}
          </div>

          {/* Step 2 — locatie */}
          <div className="space-y-1">
            <label htmlFor="location" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              2 · Locatie
            </label>
            <select
              id="location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3 disabled:bg-stera-cream-deep disabled:text-stera-ink-soft"
              required
              disabled={!companyId || loadingLocations || noLocations}
            >
              <option value="">
                {!companyId
                  ? 'Kies eerst een klant'
                  : loadingLocations
                    ? 'Locaties laden...'
                    : noLocations
                      ? 'Geen locaties bij deze klant'
                      : 'Kies een locatie'}
              </option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.floor || location.room
                    ? ` — ${[location.floor, location.room].filter(Boolean).join(' · ')}`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Step 3 — details */}
          <div className="space-y-1">
            <label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              3 · Titel
            </label>
            <input
              id="title"
              type="text"
              placeholder="Bijv. Onderhoud lente Q2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="scheduled_start" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              4 · Datum & tijdstip
            </label>
            <input
              id="scheduled_start"
              type="datetime-local"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="planned_tasks" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Geplande taken
            </label>
            <textarea
              id="planned_tasks"
              placeholder="Wat wil je vandaag doen? Vrij in te vullen."
              value={plannedTasks}
              onChange={(e) => setPlannedTasks(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="access_notes" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Toegang / praktische info
            </label>
            <textarea
              id="access_notes"
              placeholder="Bijv. badge bij de receptie, parkeren achteraan."
              value={accessNotes}
              onChange={(e) => setAccessNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="internal_notes" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Interne opmerkingen
            </label>
            <textarea
              id="internal_notes"
              placeholder="Niet zichtbaar voor de klant."
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !companyId || !locationId}
            className="stera-cta stera-cta-primary disabled:opacity-50"
          >
            {loading ? 'Opslaan...' : 'Afspraak opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
