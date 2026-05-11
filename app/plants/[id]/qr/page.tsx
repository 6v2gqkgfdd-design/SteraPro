import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QRCode from 'qrcode'

/**
 * Printbaar QR-label voor één enkele plant.
 * Cmd+P / Ctrl+P om af te drukken.
 */
export default async function PlantQRPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: plant, error: plantError } = await supabase
    .from('plants')
    .select(
      'id, qr_slug, nickname, plant_code, reference_code, species, location_id'
    )
    .eq('id', id)
    .maybeSingle()

  if (plantError || !plant) {
    notFound()
  }

  if (!plant.qr_slug) {
    return (
      <main className="bg-white p-6 text-black">
        <Link href={`/plants/${plant.id}`} className="text-sm underline">
          ← Terug naar plant
        </Link>
        <p className="mt-4">Deze plant heeft nog geen QR-slug.</p>
      </main>
    )
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const url = `${baseUrl}/p/${plant.qr_slug}`
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 320,
    margin: 1,
  })

  const displayName =
    plant.nickname ||
    plant.species ||
    plant.plant_code ||
    plant.reference_code ||
    'Plant'

  return (
    <main className="bg-white p-6 text-black">
      <div className="mb-6 print:hidden">
        <Link href={`/plants/${plant.id}`} className="text-sm underline">
          ← Terug naar plant
        </Link>
        <h1 className="mt-2 text-2xl font-bold">QR-label · {displayName}</h1>
        <p className="mt-2 text-sm text-gray-600">
          Druk af met Cmd+P (Mac) of Ctrl+P (Windows).
        </p>
      </div>

      <div className="mx-auto max-w-md break-inside-avoid rounded-2xl border p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR code voor ${displayName}`}
          className="mx-auto h-[320px] w-[320px]"
        />

        <p className="mt-4 text-xl font-semibold">{displayName}</p>

        {plant.species && plant.species !== displayName && (
          <p className="text-sm text-gray-600">{plant.species}</p>
        )}

        {plant.reference_code && (
          <p className="mt-1 font-mono text-xs text-gray-500">
            {plant.reference_code}
          </p>
        )}

        <p className="mt-3 break-all text-[10px] text-gray-500">{url}</p>
      </div>
    </main>
  )
}
