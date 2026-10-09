import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { demoEnabled } from '@/lib/demo-session'
import { demoPublicPlant } from '@/lib/portal-demo-data'
import PrintButton from './print-button'

export const dynamic = 'force-dynamic'

async function lookup(slug: string) {
  const demo = demoEnabled() ? demoPublicPlant(slug) : null
  if (demo) return { name: demo.nickname || demo.species || 'Plant', species: demo.species }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_public_plant', { _slug: slug })
    if (error || !data) return null
    const name = data.nickname || data.species || 'Plant'
    return { name: String(name), species: data.species ? String(data.species) : null }
  } catch {
    return null
  }
}

export default async function LabelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const plant = await lookup(slug)
  if (!plant) notFound()

  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') || headerList.get('host') || 'localhost:3000'
  const proto = headerList.get('x-forwarded-proto') || 'https'
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`
  const url = `${origin}/p/${slug}`
  const qrDataUrl = await QRCode.toDataURL(url, { width: 360, margin: 1 })

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <div className="mb-6 print:hidden">
        <Link href={`/p/${slug}`} className="text-sm underline">
          ← Terug naar de plant
        </Link>
        <h1 className="mt-2 text-2xl font-bold">QR-label</h1>
        <p className="mt-2 text-sm text-gray-600">
          Kies afdrukken en bewaar als PDF. Op het label staan alleen de plant en de QR, geen klantnaam.
        </p>
        <PrintButton />
      </div>
      <article className="mx-auto flex max-w-sm break-inside-avoid flex-col items-center rounded-2xl border border-black/10 p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sterapro-logo.png" alt="SteraPro" className="mb-4 h-10 w-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`QR voor ${plant.name}`} className="h-64 w-64" />
        <p className="mt-4 text-xl font-semibold">{plant.name}</p>
        {plant.species && plant.species !== plant.name ? (
          <p className="text-sm text-gray-600">{plant.species}</p>
        ) : null}
        <p className="mt-3 break-all text-[10px] text-gray-500">{url}</p>
      </article>
    </main>
  )
}
