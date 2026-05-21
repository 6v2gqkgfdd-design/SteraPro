'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

/**
 * Toolbar bovenaan de print-/PDF-weergave van een werkbon.
 * Wordt niet meegeprint (klasse `wo-toolbar`, verborgen via @media print).
 *
 * Bij het openen van de pagina wordt de afdruk-/PDF-dialoog automatisch
 * geopend zodra alle afbeeldingen geladen zijn, zodat de plantfoto's
 * mee in de PDF komen.
 */
export default function WorkOrderPrintToolbar({
  workOrderId,
}: {
  workOrderId: string
}) {
  const printed = useRef(false)

  useEffect(() => {
    if (printed.current) return
    printed.current = true

    let timer: ReturnType<typeof setTimeout> | undefined
    const fire = () => {
      // Korte buffer zodat de lay-out volledig gerenderd is.
      timer = setTimeout(() => window.print(), 400)
    }

    if (document.readyState === 'complete') {
      fire()
    } else {
      window.addEventListener('load', fire, { once: true })
    }

    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('load', fire)
    }
  }, [])

  return (
    <div className="wo-toolbar mx-auto mb-5 flex max-w-[820px] flex-wrap items-center justify-between gap-3">
      <Link
        href={`/work-orders/${workOrderId}`}
        className="text-sm text-stera-green underline-offset-4 hover:underline"
      >
        ← Terug naar werkbon
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="stera-cta stera-cta-primary"
      >
        Download als PDF
      </button>
    </div>
  )
}
