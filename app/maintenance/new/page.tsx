'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatRoomLabel } from '@/lib/rooms'

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

type Room = {
  id: string
  name: string
  floor: string | null
}

export default function NewMaintenancePage() {
  const supabase = createClient()
  const router = useRouter()

  const [companies, setCompanies] = useState<Company[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [loadingRooms, setLoadingRooms] = useState(false)

  const [companyId, setCompanyId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])
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

  // Load rooms whenever location changes
  useEffect(() => {
    if (!locationId) {
      setRooms([])
      setSelectedRoomIds([])
      return
    }

    let cancelled = false

    async function loadRooms() {
      setLoadingRooms(true)
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name, floor')
        .eq('location_id', locationId)
        .order('name', { ascending: true })

      if (cancelled) return

      if (error) {
        setError(error.message)
        setLoadingRooms(false)
        return
      }

      setRooms((data ?? []) as Room[])
      setSelectedRoomIds([])
      setLoadingRooms(false)
    }

    loadRooms()

    return () => {
      cancelled = true
    }
  }, [locationId, supabase])

  function toggleRoom(roomId: string) {
    setSelectedRoomIds((prev) =>
      prev.includes(roomId)
        ? prev.filter((r) => r !== roomId)
        : [...prev, roomId]
    )
  }

  function selectAllRooms() {
    setSelectedRoomIds(rooms.map((r) => r.id))
  }

  function clearRooms() {
    setSelectedRoomIds([])
  }

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

      const { data: insertedVisit, error } = await supabase
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

      if (error || !insertedVisit) {
        throw new Error(error?.message || 'Opslaan mislukt.')
      }

      // Koppel geselecteerde ruimtes aan de beurt
      if (selectedRoomIds.length > 0) {
        const { error: roomLinkError } = await supabase
          .from('maintenance_visit_rooms')
          .insert(
            selectedRoomIds.map((roomId) => ({
              visit_id: insertedVisit.id,
              room_id: roomId,
            }))
          )
        if (roomLinkError) {
          throw new Error(
            `Beurt aangemaakt maar ruimtes koppelen mislukt: ${roomLinkError.message}`
          )
        }
      }

      router.push('/maintenance')
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

          {/* Step 3 — ruimte(s) */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              3 · Ruimte(s)
            </label>
            {!locationId ? (
              <p className="text-xs text-stera-ink-soft">
                Kies eerst een locatie.
              </p>
            ) : loadingRooms ? (
              <p className="text-xs text-stera-ink-soft">Ruimtes laden...</p>
            ) : rooms.length === 0 ? (
              <p className="text-xs text-stera-ink-soft">
                Geen ruimtes gevonden voor deze locatie. Voeg er eerst een toe
                via de locatiepagina.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {rooms.map((room) => {
                    const selected = selectedRoomIds.includes(room.id)
                    const label = formatRoomLabel(room.name, room.floor)
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => toggleRoom(room.id)}
                        className={
                          selected
                            ? 'rounded-full bg-stera-green px-3 py-1 text-xs font-semibold text-white'
                            : 'rounded-full border border-stera-line bg-white px-3 py-1 text-xs font-medium text-stera-ink hover:border-stera-green'
                        }
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={selectAllRooms}
                    className="text-stera-green underline-offset-4 hover:underline"
                  >
                    Volledige locatie
                  </button>
                  {selectedRoomIds.length > 0 && (
                    <button
                      type="button"
                      onClick={clearRooms}
                      className="text-stera-ink-soft underline-offset-4 hover:underline"
                    >
                      Wissen
                    </button>
                  )}
                </div>
                <p className="text-xs text-stera-ink-soft">
                  Tijdens onderhoud filteren we planten op deze ruimte(s).
                </p>
              </>
            )}
          </div>

          {/* Step 4 — type bezoek */}
          <div className="space-y-2">
            <label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              4 · Type bezoek
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                'Eerste analyse',
                'Routine onderhoud',
                'Behandeling',
                'Vervangingen',
                'Levering',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTitle(preset)}
                  className={
                    title === preset
                      ? 'rounded-full bg-stera-green px-3 py-1 text-xs font-semibold text-white'
                      : 'rounded-full border border-stera-line bg-white px-3 py-1 text-xs font-medium text-stera-ink hover:border-stera-green'
                  }
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              id="title"
              type="text"
              placeholder="Of typ vrij — bv. 'Onderhoud + analyse'"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              required
            />
            <p className="text-xs text-stera-ink-soft">
              Klant en locatie tonen we sowieso in de lijst — de titel
              beschrijft kort wát voor bezoek het is.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="scheduled_start" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              5 · Datum & tijdstip
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
