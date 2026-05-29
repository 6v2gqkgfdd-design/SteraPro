'use client'

import { useState } from 'react'
import { deleteQuoteAction } from './actions'

/**
 * Verwijderen van een offerte met dubbele bevestiging:
 *   1. Klik op 'Verwijderen' → dialog opent
 *   2. Klant moet expliciet 'VERWIJDER' typen om de actie vrij te geven
 *
 * Bij submit wordt de quote + cascade-lines uit de database verwijderd
 * en de gebruiker terug naar /quotes geredirect (server action regelt
 * dat).
 */
export default function DeleteQuoteButton({
  quoteId,
  referenceNumber,
}: {
  quoteId: string
  referenceNumber: string | null
}) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setConfirm('')
          setOpen(true)
        }}
        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
      >
        Verwijderen
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stera-ink/40 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="stera-eyebrow text-red-700 mb-2">Verwijderen</p>
            <h2 className="text-lg font-bold text-stera-ink">
              Offerte definitief verwijderen?
            </h2>
            <p className="mt-2 text-sm text-stera-ink-soft">
              {referenceNumber ? (
                <>
                  Offerte <strong>{referenceNumber}</strong> en alle
                  bijhorende regels worden verwijderd. Deze actie kan niet
                  ongedaan gemaakt worden.
                </>
              ) : (
                <>
                  Deze offerte en alle bijhorende regels worden verwijderd.
                  Deze actie kan niet ongedaan gemaakt worden.
                </>
              )}
            </p>
            <p className="mt-4 text-xs text-stera-ink-soft">
              Typ <code className="rounded bg-stera-cream-deep px-1.5 py-0.5 font-mono">VERWIJDER</code> om te bevestigen.
            </p>
            <input
              type="text"
              autoFocus
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-2 w-full rounded-lg border border-stera-line bg-white p-2 font-mono text-sm uppercase"
              placeholder="VERWIJDER"
            />

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-stera-line bg-white px-4 py-2 text-sm font-medium text-stera-ink transition hover:bg-stera-cream-deep"
              >
                Annuleren
              </button>
              <form action={deleteQuoteAction}>
                <input type="hidden" name="quote_id" value={quoteId} />
                <input type="hidden" name="confirm" value={confirm} />
                <button
                  type="submit"
                  disabled={confirm !== 'VERWIJDER'}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Definitief verwijderen
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
