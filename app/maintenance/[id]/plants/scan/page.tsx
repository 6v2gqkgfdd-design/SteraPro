'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
      if (byPlantId) {
        return { type: 'plantId', value: byPlantId }
      }

      const byReference = url.searchParams.get('reference')
      if (byReference) {
        return { type: 'reference', value: byReference }
      }

      const parts = url.pathname.split('/').filter(Boolean)

      const plantsIndex = parts.findIndex((part) => part === 'plants')
      if (plantsIndex >= 0 && parts[plantsIndex + 1]) {
        return { type: 'plantId', value: parts[plantsIndex + 1] }
      }

      const shortLinkIndex = parts.findIndex((part) => part === 'p')
      if (shortLinkIndex >= 0 && parts[shortLinkIndex + 1]) {
        return { type: 'qrSlug', value: parts[shortLinkIndex + 1] }
      }
    } catch {
      return null
    }
  }

  if (value.startsWith('PLT-')) {
    return { type: 'reference', value }
  }

  return { type: 'reference', value }
}

export default function MaintenancePlantScanPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const visitId = params.id
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const hasHandledScanRef = useRef(false)

  const [visitTitle, setVisitTitle] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locationName, setLocationName] = useState('')
  const [loadingVisit, setLoadingVisit] = useState(true)
  const [startingScanner, setStartingScanner] = useState(false)
  const [scanResult, setScanResult] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadVisit() {
      setLoadingVisit(true)
      setError('')

      const { data, error } = await supabase
        .from('maintenance_visits')
        .select(`
          id,
          title,
          location_id,
          locations (
            id,
            name
          )
        `)
        .eq('id', visitId)
        .single()

      if (error || !data) {
        setError('Kon onderhoudsbeurt niet ophalen.')
        setLoadingVisit(false)
        return
      }

      const locationData = data.locations as any
      const resolvedLocationName = Array.isArray(locationData)
        ? (locationData[0]?.name || '')
        : (locationData?.name || '')

      setVisitTitle(data.title || '')
      setLocationId(data.location_id || '')
      setLocationName(resolvedLocationName)
      setLoadingVisit(false)
    }

    if (visitId) {
      loadVisit()
    }
  }, [visitId, supabase])

  useEffect(() => {
    if (loadingVisit || !locationId) return

    let cancelled = false

    async function startScanner() {
      setStartingScanner(true)
      setError('')

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
            if (hasHandledScanRef.current) return
            hasHandledScanRef.current = true
            setScanResult(decodedText)

            try {
              await scanner.stop()
            } catch {}

            const extracted = extractPlantReference(decodedText)

            if (!extracted) {
              setError('QR-code niet herkend. Gebruik een geldige plantcode of plant-URL.')
              hasHandledScanRef.current = false
              return
            }

            let plantQuery = supabase
              .from('plants')
              .select('id, location_id, reference_code, qr_slug')
              .limit(1)

            if (extracted.type === 'plantId') {
              plantQuery = plantQuery.eq('id', extracted.value)
            } else if (extracted.type === 'reference') {
              plantQuery = plantQuery.eq('reference_code', extracted.value)
            } else {
              plantQuery = plantQuery.eq('qr_slug', extracted.value)
            }

            const { data: plant, error: plantError } = await plantQuery.maybeSingle()

            if (plantError || !plant) {
              setError('Geen plant gevonden voor deze QR-code.')
              hasHandledScanRef.current = false
              return
            }

            if (plant.location_id !== locationId) {
              setError('Deze plant hoort niet bij de locatie van deze onderhoudsbeurt.')
              hasHandledScanRef.current = false
              return
            }

            router.push(`/maintenance/${visitId}/plants/${plant.id}`)
            router.refresh()
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
        if (!cancelled) {
          setStartingScanner(false)
        }
      }
    }

    startScanner()

    return () => {
      cancelled = true

      const scanner = scannerRef.current
      scannerRef.current = null

      if (scanner) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scanner.clear()
            } catch {}
          })
      }
    }
  }, [loadingVisit, locationId, router, supabase, visitId])

  return (
    <main className="p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Bestaande plant scannen</h1>
            {visitTitle && (
              <p className="text-sm text-gray-600">
                Onderhoud: {visitTitle}
              </p>
            )}
            {locationName && (
              <p className="text-sm text-gray-600">
                Locatie: {locationName}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Link
              href={`/maintenance/${visitId}/plants`}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Terug
            </Link>

            <Link
              href="/dashboard"
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="rounded-xl border p-5">
          <p className="mb-4 text-sm text-gray-600">
            Scan de QR-code van een plant. Bij een geldige code ga je meteen naar het onderhoudsformulier van die plant.
          </p>

          <div
            id="qr-reader"
            className="overflow-hidden rounded-xl border bg-black/5"
          />

          {(loadingVisit || startingScanner) && (
            <p className="mt-4 text-sm text-gray-600">
              Camera wordt gestart...
            </p>
          )}

          {scanResult && (
            <p className="mt-4 break-all text-sm text-gray-600">
              Gescande code: {scanResult}
            </p>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
          Deze scanner ondersteunt nu drie formaten: <code>PLT-...</code>, een plant-URL met <code>plantId</code> of <code>reference</code>, en short links zoals <code>/p/slug</code>.
        </div>
      </div>
    </main>
  )
}
