'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatRoomLabel } from '@/lib/rooms'

const TITLE_PRESETS = [
  'Eerste analyse',
  'Routine onderhoud',
  'Behandeling',
  'Vervangingen',
  'Levering',
]

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

export default function EditMaintenancePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const visitId = params?.id

  const [loadingContext, setLoadingContext] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [locationName, setLocationName] = useState('')

  type Room = { id: string; name: string; floor: string | null }
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])
  const [originalRoomIds, setOriginalRoomIds] = useState<string[]>([])

  const [title, setTitle] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [plannedTasks, setPlannedTasks] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [generalNotes, setGeneralNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visitId) return
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('maintenance_visits')
        .select(
          `id, title, location_id, scheduled_start, planned_tasks, access_notes,
           internal_notes, general_notes,
           companies ( name ),
           locations ( name ),
           maintenance_visit_rooms ( room_id )`
        )
        .eq('id', visitId)
        .single()

      if (cancelled) return

      if (error || !data) {
        setError(error?.message || 'Onderhoudsbeurt niet gevonden.')
        setLoadingContext(false)
        return
      }

      const company = Array.isArray(data.companies)
        ? data.companies[0]
        : data.companies
      const location = Array.isArray(data.locations)
        ? data.locations[0]
        : data.locations

      setCompanyName(company?.name ?? '')
      setLocationName(location?.name ?? '')
      setTitle(data.title ?? '')
      setScheduledStart(toLocalInputValue(data.scheduled_start))
      setPlannedTasks(data.planned_tasks ?? '')
      setAccessNotes(data.access_notes ?? '')
      setInternalNotes(data.internal_notes ?? '')
      setGeneralNotes(data.general_notes ?? '')

      const existingRoomIds: string[] = (data.maintenance_visit_rooms ?? [])
        .map((r: { room_id: string | null }) => r.room_id)
        .filter((id: string | null): id is string => Boolean(id))
      setSelectedRoomIds(existingRoomIds)
      setOriginalRoomIds(existingRoomIds)

      // Load all rooms for this location for the picker
      if (data.location_id) {
        const { data: roomsData } = await supabase
          .from('rooms')
          .select('id, name, floor')
          .eq('location_id', data.location_id)
          .order('name', { ascending: true })
        if (!cancelled) setRooms((roomsData ?? []) as Room[])
      }

      setLoadingContext(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [visitId, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!visitId) return
    setSaving(true)
    setError('')

    try {
      const { error } = await supabase
        .from('maintenance_visits')
        .update({
          title,
          scheduled_start: scheduledStart
            ? new Date(scheduledStart).toISOString()
            : null,
          planned_tasks: plannedTasks || null,
          access_notes: accessNotes || null,
          internal_notes: internalNotes || null,
          general_notes: generalNotes || null,
        })
        .eq('id', visitId)

      if (error) throw new Error(error.message)

      // Diff de ruimtes: verwijder weggehaalde, voeg nieuwe toe
      const toAdd = selectedRoomIds.filter(
        (id) => !originalRoomIds.includes(id)
      )
      const toRemove = originalRoomIds.filter(
        (id) => !selectedRoomIds.includes(id)
      )

      if (toRemove.length > 0) {
        const { error: delErr } = await supabase
          .from('maintenance_visit_rooms')
          .delete()
          .eq('visit_id', visitId)
          .in('room_id', toRemove)
        if (delErr) throw new Error(delErr.message)
      }

      if (toAdd.length > 0) {
        const { error: insErr } = await supabase
          .from('maintenance_visit_rooms')
          .insert(
            toAdd.map((roomId) => ({ visit_id: visitId, room_id: roomId }))
          )
        if (insErr) throw new Error(insErr.message)
      }

      router.push(`/maintenance/${visitId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setSaving(false)
    }
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="stera-eyebrow mb-2">Onderhoudsbeurt</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Bewerken</h1>
          {loadingContext ? (
            <p className="mt-2 text-sm text-stera-ink-soft">Laden...</p>
          ) : (
            <p className="mt-2 text-sm text-stera-ink-soft">
              {companyName || 'Onbekende klant'}
              {locationName ? ` · ${locationName}` : ''}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="stera-card space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Ruimte(s)
            </label>
            {rooms.length === 0 ? (
              <p className="text-xs text-stera-ink-soft">
                Geen ruimtes gevonden voor deze locatie.
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
                        onClick={() =>
                          setSelectedRoomIds((prev) =>
                            prev.includes(room.id)
                              ? prev.filter((r) => r !== room.id)
                              : [...prev, room.id]
                          )
                        }
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
                    onClick={() => setSelectedRoomIds(rooms.map((r) => r.id))}
                    className="text-stera-green underline-offset-4 hover:underline"
                  >
                    Volledige locatie
                  </button>
                  {selectedRoomIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedRoomIds([])}
                      className="text-stera-ink-soft underline-offset-4 hover:underline"
                    >
                      Wissen
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="title"
              className="text-xs font-semibold uppercase tracking-wider text-stera-green"
            >
              Type bezoek
            </label>
            <div className="flex flex-wrap gap-2">
              {TITLE_PRESETS.map((preset) => (
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              required
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="scheduled_start"
              className="text-xs font-semibold uppercase tracking-wider text-stera-green"
            >
              Datum & tijdstip
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
            <label
              htmlFor="planned_tasks"
              className="text-xs font-semibold uppercase tracking-wider text-stera-green"
            >
              Geplande taken
            </label>
            <textarea
              id="planned_tasks"
              value={plannedTasks}
              onChange={(e) => setPlannedTasks(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="general_notes"
              className="text-xs font-semibold uppercase tracking-wider text-stera-green"
            >
              Algemene notities (verschijnen op werkbon)
            </label>
            <textarea
              id="general_notes"
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="access_notes"
              className="text-xs font-semibold uppercase tracking-wider text-stera-green"
            >
              Toegang / praktische info
            </label>
            <textarea
              id="access_notes"
              value={accessNotes}
              onChange={(e) => setAccessNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="internal_notes"
              className="text-xs font-semibold uppercase tracking-wider text-stera-green"
            >
              Interne opmerkingen
            </label>
            <textarea
              id="internal_notes"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving || loadingContext}
              className="stera-cta stera-cta-primary disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <Link
              href={`/maintenance/${visitId}`}
              className="stera-cta stera-cta-ghost"
            >
              Annuleren
            </Link>
          </div>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
