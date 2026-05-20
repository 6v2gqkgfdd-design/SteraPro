import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PlantReportPageForm from './form'

type PublicPlantLite = {
  id: string
  qr_slug: string | null
  nickname: string | null
  species: string | null
  reference_code: string | null
}

function plantTitle(p: PublicPlantLite | null): string {
  if (!p) return 'Plant'
  return (
    p.nickname || p.species || p.reference_code || 'Plant'
  )
}

async function lookupPlant(slug: string): Promise<PublicPlantLite | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null
  }
  try {
    const supabase = await createClient()
    // Via de publieke RPC, zodat de melding-pagina ook werkt voor
    // bezoekers die niet ingelogd zijn.
    const { data, error } = await supabase.rpc('get_public_plant', {
      _slug: slug,
    })
    if (error || !data) return null
    return data as PublicPlantLite
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const plant = await lookupPlant(slug)
  return {
    title: `Melding · ${plantTitle(plant)}`,
    description: 'Meld een probleem met deze plant — Stera Pro',
  }
}

export default async function PlantReportPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const plant = await lookupPlant(slug)

  return (
    <main className="flex min-h-screen flex-col bg-stera-cream text-stera-ink">
      <header className="flex items-center justify-between border-b border-stera-line px-5 py-3">
        <Link
          href={`/p/${slug}`}
          className="text-sm text-stera-green underline-offset-4 hover:underline"
        >
          ← Terug
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/stera-logo.png"
          alt="Stera"
          className="h-8 w-auto select-none"
        />
      </header>

      <div className="flex-1 px-5 py-4">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-3">
            <h1 className="text-xl font-bold tracking-tight">
              Probleem melden
            </h1>
            <p className="text-xs text-stera-ink-soft">
              Plant: {plantTitle(plant)}
            </p>
          </div>

          {plant ? (
            <PlantReportPageForm slug={slug} />
          ) : (
            <p className="text-sm text-stera-ink-soft">
              Deze plant is niet (meer) gekoppeld. Scan de QR-code opnieuw.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
