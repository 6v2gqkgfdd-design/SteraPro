'use client'

import { useState } from 'react'
import { deleteWorkOrder } from './actions'

type Props = {
  workOrderId: string
  visitId: string
  status: string
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'concept',
  sent: 'verstuurd',
  signed: 'ondertekend door klant',
  cancelled: 'geannuleerd',
}

export default function DeleteWorkOrderButton({
  workOrderId,
  visitId,
  status,
}: Props) {
  const [confirming, setConfirming] = useState(false)
  const isSigned = status === 'signed'
  const label = STATUS_LABEL[status] || status

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Werkbon verwijderen
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-900">
        Werkbon definitief verwijderen?
        {isSigned ? (
          <strong className="ml-1">
            Let op — deze is {label}. Verwijderen wist ook de handtekening.
          </strong>
        ) : (
          <span className="ml-1">Status: {label}.</span>
        )}{' '}
        De onderhoudsbeurt zelf blijft bestaan; je kan er later een nieuwe
        werkbon van maken indien gewenst.
      </p>
      <form action={deleteWorkOrder} className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={workOrderId} />
        <input type="hidden" name="visit_id" value={visitId} />
        <button
          type="submit"
          className="rounded-lg bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700"
        >
          Ja, verwijder werkbon
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-stera-line bg-white px-3 py-1 text-sm font-medium text-stera-ink hover:border-stera-green"
        >
          Annuleren
        </button>
      </form>
    </div>
  )
}
