'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Props = {
  visitId: string
  status: string
  // Werkbon-info opgehaald in de server-component
  workOrder: { id: string; status: string } | null
}

export default function VisitManagement({
  visitId,
  status,
  workOrder,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const isScheduled = status === 'scheduled'
  const isCancelled = status === 'cancelled'
  const isCompleted = status === 'completed'
  const hasWorkOrder = workOrder !== null
  const workOrderIsSigned = workOrder?.status === 'signed'

  async function handleCreateWorkOrder() {
    setBusy(true)
    setError('')

    try {
      if (hasWorkOrder) {
        throw new Error(
          'Er bestaat al een werkbon voor deze beurt. Open hem via "Werkbon openen".'
        )
      }

      const { error: insertError } = await supabase
        .from('work_orders')
        .insert([{ visit_id: visitId }])

      if (insertError) {
        // 23505 = unique violation = werkbon bestaat al
        if (insertError.code === '23505') {
          throw new Error(
            'Er bestaat al een werkbon voor deze beurt. Herlaad de pagina.'
          )
        }
        throw new Error(insertError.message)
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Werkbon maken mislukt.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    setBusy(true)
    setError('')

    try {
      const { error: updError } = await supabase
        .from('maintenance_visits')
        .update({ status: 'cancelled' })
        .eq('id', visitId)

      if (updError) throw new Error(updError.message)

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Annuleren mislukt.')
    } finally {
      setBusy(false)
      setConfirmCancel(false)
    }
  }

  async function handleReactivate() {
    setBusy(true)
    setError('')

    try {
      const { error: updError } = await supabase
        .from('maintenance_visits')
        .update({ status: 'scheduled' })
        .eq('id', visitId)

      if (updError) throw new Error(updError.message)

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Heractiveren mislukt.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError('')

    try {
      if (workOrderIsSigned) {
        throw new Error(
          'Werkbon is al ondertekend door de klant — verwijderen niet toegestaan.'
        )
      }

      // Cascade-delete via FK ruimt visit_plants, consumables, pause_logs,
      // visit_logs en work_orders mee op.
      const { error: delError } = await supabase
        .from('maintenance_visits')
        .delete()
        .eq('id', visitId)

      if (delError) throw new Error(delError.message)

      router.push('/maintenance')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt.')
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/maintenance/${visitId}/edit`}
          className="stera-cta stera-cta-ghost"
        >
          Bewerken
        </Link>

        {isCompleted && !hasWorkOrder && (
          <button
            type="button"
            onClick={handleCreateWorkOrder}
            disabled={busy}
            className="stera-cta stera-cta-primary disabled:opacity-50"
          >
            {busy ? 'Werkbon maken...' : 'Werkbon maken'}
          </button>
        )}

        {hasWorkOrder && (
          <Link
            href={`/work-orders/${workOrder!.id}`}
            className="stera-cta stera-cta-primary"
          >
            Werkbon openen
          </Link>
        )}

        {isScheduled &&
          (!confirmCancel ? (
            <button
              type="button"
              onClick={() => {
                setError('')
                setConfirmCancel(true)
              }}
              disabled={busy}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
            >
              Annuleren
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <span className="text-sm text-amber-900">
                Beurt markeren als geannuleerd?
              </span>
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="rounded-lg bg-amber-600 px-3 py-1 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? 'Bezig...' : 'Ja, annuleer'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                disabled={busy}
                className="rounded-lg border border-stera-line bg-white px-3 py-1 text-sm font-medium text-stera-ink hover:border-stera-green"
              >
                Terug
              </button>
            </div>
          ))}

        {isCancelled && (
          <button
            type="button"
            onClick={handleReactivate}
            disabled={busy}
            className="rounded-lg border border-stera-line bg-white px-4 py-2 text-sm font-medium text-stera-ink hover:border-stera-green disabled:opacity-50"
          >
            Heractiveren (terug naar gepland)
          </button>
        )}

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => {
              setError('')
              setConfirmDelete(true)
            }}
            disabled={busy || workOrderIsSigned}
            title={
              workOrderIsSigned
                ? 'Werkbon is ondertekend — verwijderen niet toegestaan'
                : undefined
            }
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Verwijderen
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <span className="text-sm text-red-800">
              Zeker? Alles van deze beurt wordt verwijderd.
            </span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="rounded-lg bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Verwijderen...' : 'Ja, verwijder'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="rounded-lg border border-stera-line bg-white px-3 py-1 text-sm font-medium text-stera-ink hover:border-stera-green"
            >
              Annuleren
            </button>
          </div>
        )}
      </div>

      {hasWorkOrder && (
        <p className="text-xs text-stera-ink-soft">
          Werkbon-status:{' '}
          <span className="font-medium text-stera-ink">
            {workOrder!.status}
          </span>
          {workOrderIsSigned
            ? ' — beurt kan niet meer verwijderd worden.'
            : ''}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
