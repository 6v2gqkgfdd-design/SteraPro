import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QRCode from 'qrcode'

export default async function LocationQRPage({
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

  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('*')
    .eq('id', id)
    .single()

  if (locationError || !location) {
    notFound()
  }

  const { data: plants, error: plantsError } = await supabase
    .from('plants')
    .select('*')
    .eq('location_id', id)
    .order('created_at', { ascending: false })

  if (plantsError) {
    return (
      <main className="p-6">
        <p className="text-red-600">
          Fout bij ophalen planten: {plantsError.message}
        </p>
      </main>
    )
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const plantsWithQr = await Promise.all(
    (plants || []).map(async (plant) => {
      const url = `${baseUrl}/p/${plant.qr_slug}`
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 220,
        margin: 1,
      })

      return {
        ...plant,
        url,
        qrDataUrl,
      }
    })
  )

  return (
    <main className="bg-white p-6 text-black">
      <div className="mb-6">
        <Link href={`/locations/${location.id}`} className="text-sm underline">
          ← Terug naar locatie
        </Link>

        <h1 className="mt-2 text-3xl font-bold">
          QR-labels - {location.name}
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          Je kunt deze pagina afdrukken via je browser met Cmd+P of Ctrl+P.
        </p>
      </div>

      {!plantsWithQr || plantsWithQr.length === 0 ? (
        <p>Nog geen planten op deze locatie.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plantsWithQr.map((plant) => (
            <div
              key={plant.id}
              className="break-inside-avoid rounded-2xl border p-4 text-center"
            >
              <img
                src={plant.qrDataUrl}
                alt={`QR code voor ${plant.nickname || plant.plant_code || 'plant'}`}
                className="mx-auto h-[220px] w-[220px]"
              />

              <p className="mt-3 text-lg font-semibold">
                {plant.nickname || plant.plant_code || 'Plant'}
              </p>

              {plant.plant_code && (
                <p className="text-sm text-gray-600">{plant.plant_code}</p>
              )}

              {plant.species && (
                <p className="text-sm text-gray-600">{plant.species}</p>
              )}

              <p className="mt-2 break-all text-xs text-gray-500">
                {plant.url}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
