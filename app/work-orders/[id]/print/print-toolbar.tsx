'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * Toolbar bovenaan de print-/PDF-weergave van een werkbon.
 * Wordt niet meegeprint (klasse `wo-toolbar`, verborgen via @media print).
 *
 * Belangrijk: we openen het afdruk-/PDF-venster pas zodra alle
 * afbeeldingen volledig geladen zijn. Anders loopt het afdrukvoorbeeld
 * van de browser vast op nog ladende foto's.
 */
function waitForImages(timeoutMs = 9000): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()

  const images = Array.from(document.images)
  const allLoaded = Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })
    })
  ).then(() => undefined)

  // Veiligheidstimer: nooit eindeloos wachten op een trage foto.
  const fallback = new Promise<void>((resolve) =>
    setTimeout(resolve, timeoutMs)
  )

  return Promise.race([allLoaded, fallback])
}

export default function WorkOrderPrintToolbar({
  workOrderId,
}: {
  workOrderId: string
}) {
  const started = useRef(false)
  const [busy, setBusy] = useState(true)

  async function openPrintDialog() {
    setBusy(true)
    await waitForImages()
    // Korte buffer zodat de lay-out zeker volledig gerenderd is.
    await new Promise((r) => setTimeout(r, 200))
    setBusy(false)
    window.print()
  }

  useEffect(() => {
    // Eénmalig automatisch het afdrukvenster openen bij het laden.
    if (started.current) return
    started.current = true
    void openPrintDialog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        onClick={openPrintDialog}
        disabled={busy}
        className="stera-cta stera-cta-primary disabled:opacity-50"
      >
        {busy ? 'Even klaarzetten…' : 'Download als PDF'}
      </button>
    </div>
  )
}
