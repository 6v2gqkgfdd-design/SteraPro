'use client'

import { useEffect } from 'react'

/**
 * Lichtgewicht confirm-dialoog die past in de Stera look.
 * Vervangt `window.confirm(...)` waar we netter willen.
 *
 * Gebruik:
 *   const [confirmOpen, setConfirmOpen] = useState(false)
 *   <button onClick={() => setConfirmOpen(true)}>Verwijderen</button>
 *   <ConfirmModal
 *     open={confirmOpen}
 *     title="Verwijderen?"
 *     description="Deze actie is niet ongedaan te maken."
 *     confirmLabel="Verwijderen"
 *     tone="danger"
 *     onConfirm={async () => { ...; setConfirmOpen(false) }}
 *     onCancel={() => setConfirmOpen(false)}
 *   />
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Bevestigen',
  cancelLabel = 'Annuleren',
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  // Esc om te annuleren
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const confirmClass =
    tone === 'danger'
      ? 'stera-cta stera-cta-danger'
      : 'stera-cta stera-cta-primary'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="stera-card w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="confirm-modal-title" className="text-lg font-semibold text-stera-ink">
          {title}
        </p>
        {description ? (
          <p className="text-sm text-stera-ink-soft">{description}</p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="stera-cta stera-cta-ghost"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              void onConfirm()
            }}
            className={confirmClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
