'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'
import { createClient } from '@/lib/supabase/client'

type ExtractedPlantReference =
  | { type: 'plantId'; value: string }
  | { type: 'reference'; value: string }
  | { type: 'qrSlug'; value: string }

function extractPlantReference(rawValue: string): ExtractedPlantReference | null {
  const value = rawValue.trim()
  if (!value) return null

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const url = new URL(value)

      const byPlantId = url.searchParams.get('plantId')
      if (byPlantId) return { type: 'plantId', value: byPlantId }

      const byReference = url.searchParams.get('reference')
      if (byReference) return { type: 'reference', value: byReference }

      const parts = url.pathname.split('/').filter(Boolean)
      const plantsIndex = parts.findIndex((p) => p === 'plants')
      if (plantsIndex >= 0 && parts[plantsIndex + 1]) {
        return { type: 'plantId', value: parts[plantsIndex + 1] }
      }

      const shortLinkIndex = parts.findIndex((p) => p === 'p')
      if (shortLinkIndex >= 0 && parts[shortLinkIndex + 1]) {
        return { type: 'qrSlug', value: parts[shortLinkIndex + 1] }
      }
    } catch {
      return null
    }
  }

  if (value.startsWith('PLT-')) return { type: 'reference', value }
  return { type: 'reference', value }
}

export default function GlobalScanPage() {
  const router = useRouter()
  const supabase = createClient()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handledRef = useRef(false)

  const [scanResult, setScanResult] = useState('')
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const scanner = new Html5Qrcode('qr-reader')
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          async (decodedText) => {
            if (handledRef.current) return
            handledRef.current = true
            setScanResult(decodedText)

            try {
              await scanner.stop()
            } catch {}

            const extracted = extractPlantReference(decodedText)
            if (!extracted) {
              setError('QR-code niet herkend.')
              handledRef.current = false
              return
            }

            let q = supabase
              .from('plants')
              .select('id, qr_slug')
              .limit(1)
            if (extracted.type === 'plantId') q = q.eq('id', extracted.value)
            else if (extracted.type === 'reference')
              q = q.eq('reference_code', extracted.value)
            else q = q.eq('qr_slug', extracted.value)

            const { data: plant, error: plantError } = await q.maybeSingle()
            if (plantError || !plant) {
              setError('Geen plant gevonden voor deze code.')
              handledRef.current = false
              return
            }

            router.push(`/plants/${plant.id}`)
          },
          () => {}
        )
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Camera starten mislukt. Controleer camerarechten of gebruik HTTPS.'
          )
        }
      } finally {
        if (!cancelled) setStarting(false)
      }
    }

    start()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      scannerRef.current = null
      if (!scanner) return

      const safeClear = () => {
        try {
          scanner.clear()
        } catch {}
      }
      try {
        const stopResult = scanner.stop()
        if (stopResult && typeof stopResult.then === 'function') {
          stopResult.then(safeClear, safeClear)
        } else {
          safeClear()
        }
      } catch {
        safeClear()
      }
    }
  }, [router, supabase])

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/dashboard" className="text-sm text-stera-green underline">
          ← Terug naar dashboard
        </Link>

        <div>
          <p className="stera-eyebrow mb-2">Scan</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Plant scannen</h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Richt de camera op de QR-code van een plant. Je gaat meteen naar de
            plantfiche.
          </p>
        </div>

        <div className="stera-card">
          <div
            id="qr-reader"
            className="overflow-hidden rounded-xl border border-stera-line bg-stera-cream-deep"
          />

          {starting && (
            <p className="mt-4 text-sm text-stera-ink-soft">
              Camera wordt gestart...
            </p>
          )}

          {scanResult && (
            <p className="mt-4 break-all text-sm text-stera-ink-soft">
              Gescande code: {scanResult}
            </p>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
