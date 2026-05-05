import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

type Plant = {
  id: string
  qr_slug: string | null
  nickname: string | null
  plant_code: string | null
  reference_code: string | null
  species: string | null
  status: string | null
  is_dead: boolean | null
  is_dying: boolean | null
  needs_replacement: boolean | null
}

type MaintenanceLog = {
  performed_at: string
  watered: boolean | null
  pruned: boolean | null
  dusted: boolean | null
  rotated: boolean | null
  fed: boolean | null
  pest_treated: boolean | null
  repotted: boolean | null
  soil_refreshed: boolean | null
  polished: boolean | null
  notes: string | null
}

export const metadata: Metadata = {
  title: 'Plant',
  description: 'Plantinformatie via StéraPro QR-code.',
}

async function lookupPlant(slug: string): Promise<Plant | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('plants')
      .select(
        'id, qr_slug, nickname, plant_code, reference_code, species, status, is_dead, is_dying, needs_replacement'
      )
      .eq('qr_slug', slug)
      .maybeSingle()

    if (error || !data) return null
    return data as Plant
  } catch {
    return null
  }
}

async function lookupLatestLog(plantId: string): Promise<MaintenanceLog | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('plant_maintenance_logs')
      .select(
        'performed_at, watered, pruned, dusted, rotated, fed, pest_treated, repotted, soil_refreshed, polished, notes'
      )
      .eq('plant_id', plantId)
      .order('performed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as MaintenanceLog | null) ?? null
  } catch {
    return null
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F7F4EF] text-[#1A2F6E] flex flex-col">
      <header className="px-6 py-6 sm:px-10 sm:py-8 border-b border-[#1A2F6E]/15">
        <Link href="/" className="stera-wordmark text-[#1A2F6E] text-lg">
          Stéra<span className="text-[#4A7C59]">Pro</span>
        </Link>
      </header>
      <div className="flex-1 px-6 py-10 sm:px-10 sm:py-16">{children}</div>
      <footer className="px-6 py-6 sm:px-10 text-xs text-[#1A2F6E]/60 border-t border-[#1A2F6E]/15">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}

export default async function PublicPlantPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const plant = await lookupPlant(slug)

  if (!plant) {
    return (
      <Shell>
        <div className="mx-auto w-full max-w-xl">
          <p className="stera-eyebrow text-[#4A7C59] mb-4">QR-code · Plant</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            QR-code niet herkend
          </h1>
          <p className="text-base text-[#1A2F6E]/75 leading-relaxed mb-3">
            We konden geen plant vinden voor deze QR-code. De plant is mogelijk
            verwijderd of de code is nog niet geregistreerd in StéraPro.
          </p>
          <p className="text-sm text-[#1A2F6E]/60 mb-10">
            Gescande code:{' '}
            <span className="font-mono text-[#1A2F6E]">{slug}</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login"
              className="stera-cta inline-flex items-center justify-center bg-[#1A2F6E] px-6 py-4 text-sm text-white hover:bg-[#13245a]"
            >
              Inloggen →
            </Link>
            <Link
              href="/"
              className="stera-cta inline-flex items-center justify-center border border-[#1A2F6E] px-6 py-4 text-sm text-[#1A2F6E] hover:bg-[#1A2F6E] hover:text-white"
            >
              Terug naar start
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  const latestLog = await lookupLatestLog(plant.id)

  const statusLabel = plant.is_dead
    ? 'Plant is dood'
    : plant.is_dying
    ? 'Plant is stervend'
    : plant.needs_replacement
    ? 'Vervanging nodig'
    : 'Gezond'

  const statusColor = plant.is_dead
    ? 'bg-red-100 text-red-800 border-red-300'
    : plant.is_dying
    ? 'bg-orange-100 text-orange-800 border-orange-300'
    : plant.needs_replacement
    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
    : 'bg-[#4A7C59]/10 text-[#2f5a3e] border-[#4A7C59]/30'

  return (
    <Shell>
      <div className="mx-auto w-full max-w-2xl">
        <p className="stera-eyebrow text-[#4A7C59] mb-4">Plant · Overzicht</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          {plant.nickname || plant.plant_code || plant.reference_code || 'Plant'}
        </h1>
        {plant.species && (
          <p className="text-base text-[#1A2F6E]/75 mb-6">{plant.species}</p>
        )}

        <div
          className={`inline-flex items-center border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusColor}`}
        >
          {statusLabel}
        </div>

        <dl className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 border-t border-[#1A2F6E]/15 pt-6">
          {plant.reference_code && (
            <div>
              <dt className="stera-eyebrow text-[#1A2F6E]/60">Referentie</dt>
              <dd className="mt-1 text-sm text-[#1A2F6E]">{plant.reference_code}</dd>
            </div>
          )}
          {plant.plant_code && (
            <div>
              <dt className="stera-eyebrow text-[#1A2F6E]/60">Plantcode</dt>
              <dd className="mt-1 text-sm text-[#1A2F6E]">{plant.plant_code}</dd>
            </div>
          )}
          {plant.status && (
            <div>
              <dt className="stera-eyebrow text-[#1A2F6E]/60">Status</dt>
              <dd className="mt-1 text-sm text-[#1A2F6E]">{plant.status}</dd>
            </div>
          )}
        </dl>

        <section className="mt-10 border border-[#1A2F6E]/15 bg-white p-6">
          <h2 className="stera-eyebrow text-[#4A7C59] mb-3">Laatste onderhoud</h2>
          {latestLog ? (
            <>
              <p className="text-sm text-[#1A2F6E]/75">
                {new Date(latestLog.performed_at).toLocaleString('nl-BE')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {latestLog.watered && <span className="border border-[#1A2F6E]/20 px-2 py-1">Water</span>}
                {latestLog.pruned && <span className="border border-[#1A2F6E]/20 px-2 py-1">Gesnoeid</span>}
                {latestLog.dusted && <span className="border border-[#1A2F6E]/20 px-2 py-1">Stofvrij</span>}
                {latestLog.rotated && <span className="border border-[#1A2F6E]/20 px-2 py-1">Gedraaid</span>}
                {latestLog.fed && <span className="border border-[#1A2F6E]/20 px-2 py-1">Voeding</span>}
                {latestLog.pest_treated && <span className="border border-[#1A2F6E]/20 px-2 py-1">Plagen</span>}
                {latestLog.repotted && <span className="border border-[#1A2F6E]/20 px-2 py-1">Verpot</span>}
                {latestLog.soil_refreshed && <span className="border border-[#1A2F6E]/20 px-2 py-1">Verse aarde</span>}
                {latestLog.polished && <span className="border border-[#1A2F6E]/20 px-2 py-1">Opgeblonken</span>}
              </div>
              {latestLog.notes && (
                <p className="mt-4 text-sm text-[#1A2F6E]/80 leading-relaxed">{latestLog.notes}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-[#1A2F6E]/70">Nog geen onderhoud geregistreerd.</p>
          )}
        </section>

        <div className="mt-10">
          <Link
            href="/login"
            className="stera-cta inline-flex items-center justify-center border border-[#1A2F6E] px-6 py-3 text-xs text-[#1A2F6E] hover:bg-[#1A2F6E] hover:text-white"
          >
            Inloggen voor beheer →
          </Link>
        </div>
      </div>
    </Shell>
  )
}
