'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ConfirmModal } from '@/components/confirm-modal'

type Props = {
  visitId: string
  status: string
  // Werkbon-info opgehaald in de server-component
  workOrder: { id: string; status: string } | null
  /** 'card' = grote actie-rij. 'menu' = compact 3-dot dropdown. */
  variant?: 'card' | 'menu'
}

export default function VisitManagement({
  visitId,
  status,
  workOrder,
  variant = 'card',
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isScheduled = status === 'scheduled'
  const isCancelled = status === 'cancelled'
  const isCompleted = status === 'completed'
  const hasWorkOrder = workOrder !== null
  const workOrderIsLocked =
    workOrder?.status === 'signed' || workOrder?.status === 'invoiced'

  useEffect(() => {
    if (variant !== 'menu' || !menuOpen) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConfirmDelete(false)
        setConfirmCancel(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [variant, menuOpen])

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
      if (workOrderIsLocked) {
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

  if (variant === 'menu') {
    const menuItemClass =
      'block w-full px-4 py-3 text-left text-sm transition hover:bg-stera-cream-deep disabled:opacity-50'
    const dangerItemClass =
      'block w-full px-4 py-3 text-left text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50'
    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-label="Meer acties"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-stera-line bg-white text-stera-ink transition hover:border-stera-green"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="5" cy="12" r="1.2" />
            <circle cx="12" cy="12" r="1.2" />
            <circle cx="19" cy="12" r="1.2" />
          </svg>
        </button>
        {menuOpen ? (
          <div className="absolute right-0 z-30 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-stera-line bg-white py-1 shadow-lg">
            <Link
              href={`/maintenance/${visitId}/edit`}
              className={menuItemClass}
              onClick={() => setMenuOpen(false)}
            >
              Bewerken
            </Link>

            {isCompleted && !hasWorkOrder && (
              <button
                type="button"
                onClick={handleCreateWorkOrder}
                disabled={busy}
                className={menuItemClass}
              >
                {busy ? 'Werkbon maken...' : 'Werkbon maken'}
              </button>
            )}

            {hasWorkOrder && (
              <Link
                href={`/work-orders/${workOrder!.id}`}
                className={menuItemClass}
                onClick={() => setMenuOpen(false)}
              >
                Werkbon openen ({workOrder!.status})
              </Link>
            )}

            {isScheduled && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setCancelModalOpen(true)
                }}
                disabled={busy}
                className={menuItemClass}
              >
                Beurt annuleren
              </button>
            )}

            {isCancelled && (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={busy}
                className={menuItemClass}
              >
                Heractiveren
              </button>
            )}

            <div className="border-t border-stera-line" />

            <button
              type="button"
              onClick={() => {
                if (workOrderIsLocked) {
                  toast.error(
                    'Werkbon is ondertekend — verwijder eerst de werkbon via "Werkbon openen".'
                  )
                  return
                }
                setMenuOpen(false)
                setDeleteModalOpen(true)
              }}
              disabled={busy || workOrderIsLocked}
              className={dangerItemClass}
            >
              Verwijderen
            </button>

            {error && (
              <p className="border-t border-stera-line px-4 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
          </div>
        ) : null}
      </div>
    )
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
            disabled={busy || workOrderIsLocked}
            title={
              workOrderIsLocked
                ? 'Werkbon is ondertekend — verwijder eerst de werkbon via "Werkbon openen"'
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
          {workOrderIsLocked
            ? ' — beurt kan niet meer verwijderd worden.'
            : ''}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ConfirmModal
        open={cancelModalOpen}
        title="Beurt annuleren?"
        description="De beurt wordt gemarkeerd als geannuleerd. Je kan ze later opnieuw activeren via het menu."
        confirmLabel="Annuleren"
        tone="danger"
        onConfirm={async () => {
          setCancelModalOpen(false)
          await handleCancel()
        }}
        onCancel={() => setCancelModalOpen(false)}
      />

      <ConfirmModal
        open={deleteModalOpen}
        title="Beurt verwijderen?"
        description="Alles van deze beurt — planten, verbruik, werkbon, foto's — wordt permanent verwijderd. Niet ongedaan te maken."
        confirmLabel="Beurt verwijderen"
        tone="danger"
        onConfirm={async () => {
          setDeleteModalOpen(false)
          await handleDelete()
        }}
        onCancel={() => setDeleteModalOpen(false)}
      />
    </div>
  )
}
