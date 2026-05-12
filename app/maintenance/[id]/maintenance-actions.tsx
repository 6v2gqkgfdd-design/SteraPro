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

      // Genereer automatisch een werkbon. Voor contract-klanten meteen
      // 'archived' (interne admin, geen verstuur/teken-flow). Anders
      // 'draft' zodat Jelle kan reviewen + versturen.
      let initialStatus: 'draft' | 'archived' = 'draft'
      if (visit.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('has_maintenance_contract')
          .eq('id', visit.company_id)
          .maybeSingle()
        if (company?.has_maintenance_contract) {
          initialStatus = 'archived'
        }
      }

      const { error: workOrderError } = await supabase
        .from('work_orders')
        .insert([{ visit_id: visit.id, status: initialStatus }])
      // 23505 = unique_violation: er is al een werkbon. Dat is OK.
      if (workOrderError && workOrderError.code !== '23505') {
        console.error('[work_orders] auto-create failed', workOrderError)
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Afronden mislukt.')
    } finally {
      setLoading(false)
    }
  }

  function formatTs(ts: string | null): string {
    if (!ts) return ''
    return new Date(ts).toLocaleTimeString('nl-BE', {
      timeZone: 'Europe/Brussels',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusLabel: Record<string, string> = {
    scheduled: 'Gepland',
    in_progress: 'Bezig',
    paused: 'Pauze',
    completed: 'Afgewerkt',
    cancelled: 'Geannuleerd',
  }

  const statusTone: Record<string, string> = {
    scheduled: 'bg-stera-cream-deep text-stera-ink',
    in_progress: 'bg-stera-green/15 text-stera-green',
    paused: 'bg-amber-100 text-amber-800',
    completed: 'bg-stera-green text-white',
    cancelled: 'bg-red-100 text-red-800',
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
            statusTone[visit.status] ?? 'bg-stera-cream-deep text-stera-ink'
          }`}
        >
          {statusLabel[visit.status] ?? visit.status}
        </span>
        {visit.started_at ? (
          <span className="text-xs text-stera-ink-soft">
            Start {formatTs(visit.started_at)}
            {visit.ended_at ? ` · Einde ${formatTs(visit.ended_at)}` : null}
            {visit.pause_total_minutes
              ? ` · ${visit.pause_total_minutes} min pauze`
              : null}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={startVisit}
          disabled={loading || visit.status !== 'scheduled'}
          className="stera-cta stera-cta-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start onderhoud →
        </button>

        {visit.status === 'in_progress' ? (
          <button
            onClick={startPause}
            disabled={loading}
            className="stera-cta stera-cta-ghost disabled:opacity-40"
          >
            Pauze
          </button>
        ) : null}

        {visit.status === 'paused' ? (
          <button
            onClick={stopPause}
            disabled={loading}
            className="stera-cta stera-cta-secondary disabled:opacity-40"
          >
            Hervatten →
          </button>
        ) : null}

        <button
          onClick={endVisit}
          disabled={
            loading ||
            (visit.status !== 'in_progress' && visit.status !== 'paused')
          }
          className="stera-cta stera-cta-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Einde onderhoud
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
