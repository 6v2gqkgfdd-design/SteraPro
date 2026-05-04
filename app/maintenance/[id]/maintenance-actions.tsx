'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function MaintenanceActions({ visit }: { visit: any }) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function startVisit() {
    setLoading(true)
    setError('')

    try {
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('maintenance_visits')
        .update({
          status: 'in_progress',
          started_at: visit.started_at ?? now,
        })
        .eq('id', visit.id)

      if (error) throw error

      await supabase.from('maintenance_visit_logs').insert([
        {
          visit_id: visit.id,
          event_type: 'started',
          payload: { at: now },
        },
      ])

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Starten mislukt.')
    } finally {
      setLoading(false)
    }
  }

  async function startPause() {
    setLoading(true)
    setError('')

    try {
      const now = new Date().toISOString()

      const { data: openPause } = await supabase
        .from('maintenance_visit_pause_logs')
        .select('id')
        .eq('visit_id', visit.id)
        .is('ended_at', null)
        .maybeSingle()

      if (openPause) {
        throw new Error('Er loopt al een pauze.')
      }

      const { error: visitError } = await supabase
        .from('maintenance_visits')
        .update({ status: 'paused' })
        .eq('id', visit.id)

      if (visitError) throw visitError

      const { error: pauseError } = await supabase
        .from('maintenance_visit_pause_logs')
        .insert([{ visit_id: visit.id, started_at: now }])

      if (pauseError) throw pauseError

      await supabase.from('maintenance_visit_logs').insert([
        {
          visit_id: visit.id,
          event_type: 'pause_started',
          payload: { at: now },
        },
      ])

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pauze starten mislukt.')
    } finally {
      setLoading(false)
    }
  }

  async function stopPause() {
    setLoading(true)
    setError('')

    try {
      const now = new Date().toISOString()

      const { data: openPause, error: pauseFetchError } = await supabase
        .from('maintenance_visit_pause_logs')
        .select('id, started_at')
        .eq('visit_id', visit.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pauseFetchError) throw pauseFetchError
      if (!openPause) throw new Error('Er is geen lopende pauze.')

      const startedAt = new Date(openPause.started_at).getTime()
      const endedAt = new Date(now).getTime()
      const durationMinutes = Math.max(
        0,
        Math.round((endedAt - startedAt) / 1000 / 60)
      )

      const { error: pauseUpdateError } = await supabase
        .from('maintenance_visit_pause_logs')
        .update({
          ended_at: now,
          duration_minutes: durationMinutes,
        })
        .eq('id', openPause.id)

      if (pauseUpdateError) throw pauseUpdateError

      const newPauseTotal = (visit.pause_total_minutes ?? 0) + durationMinutes

      const { error: visitUpdateError } = await supabase
        .from('maintenance_visits')
        .update({
          status: 'in_progress',
          pause_total_minutes: newPauseTotal,
        })
        .eq('id', visit.id)

      if (visitUpdateError) throw visitUpdateError

      await supabase.from('maintenance_visit_logs').insert([
        {
          visit_id: visit.id,
          event_type: 'pause_ended',
          payload: {
            at: now,
            duration_minutes: durationMinutes,
          },
        },
      ])

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pauze stoppen mislukt.')
    } finally {
      setLoading(false)
    }
  }

  async function endVisit() {
    setLoading(true)
    setError('')

    try {
      const now = new Date().toISOString()

      const { data: openPause } = await supabase
        .from('maintenance_visit_pause_logs')
        .select('id')
        .eq('visit_id', visit.id)
        .is('ended_at', null)
        .maybeSingle()

      if (openPause) {
        throw new Error('Stop eerst de lopende pauze voor je het onderhoud beëindigt.')
      }

      const { error } = await supabase
        .from('maintenance_visits')
        .update({
          status: 'completed',
          ended_at: now,
        })
        .eq('id', visit.id)

      if (error) throw error

      await supabase.from('maintenance_visit_logs').insert([
        {
          visit_id: visit.id,
          event_type: 'ended',
          payload: { at: now },
        },
      ])

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Afronden mislukt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={startVisit}
          disabled={loading || visit.status !== 'scheduled'}
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          Start onderhoud
        </button>

        <button
          onClick={startPause}
          disabled={loading || visit.status !== 'in_progress'}
          className="rounded-lg border px-4 py-2 disabled:opacity-50"
        >
          Start pauze
        </button>

        <button
          onClick={stopPause}
          disabled={loading || visit.status !== 'paused'}
          className="rounded-lg border px-4 py-2 disabled:opacity-50"
        >
          Stop pauze
        </button>

        <button
          onClick={endVisit}
          disabled={loading || (visit.status !== 'in_progress' && visit.status !== 'paused')}
          className="rounded-lg border px-4 py-2 disabled:opacity-50"
        >
          Einde onderhoud
        </button>
      </div>

      <div className="text-sm text-gray-600">
        <p>Status: {visit.status}</p>
        <p>
          Startuur:{' '}
          {visit.started_at ? new Date(visit.started_at).toLocaleString() : 'Nog niet gestart'}
        </p>
        <p>
          Einduur:{' '}
          {visit.ended_at ? new Date(visit.ended_at).toLocaleString() : 'Nog niet beëindigd'}
        </p>
        <p>Pauze totaal: {visit.pause_total_minutes ?? 0} minuten</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
