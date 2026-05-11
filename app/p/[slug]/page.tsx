import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import AnimatedPlant, { type PlantMood } from '@/components/animated-plant'
import PlantReportForm from './report-form'

type PublicPlant = {
  id: string
  qr_slug: string | null
  nickname: string | null
  plant_code: string | null
  reference_code: string | null
  species: string | null
  status: string | null
  photo_url: string | null
  is_dead: boolean | null
  is_dying: boolean | null
  needs_replacement: boolean | null
}

type LatestVisit = {
  performed_at: string | null
  actions: string[]
}

const STATUS_LABELS: Record<string, string> = {
  healthy: 'Gezond',
  needs_attention: 'Heeft aandacht nodig',
  maintenance_due: 'Onderhoud vereist',
  replacement_needed: 'Vervanging nodig',
  dead: 'Dood',
}

const STATUS_TONES: Record<string, string> = {
  healthy: 'bg-stera-green/10 text-stera-green',
  needs_attention: 'bg-amber-50 text-amber-700',
  maintenance_due: 'bg-amber-50 text-amber-700',
  replacement_needed: 'bg-red-50 text-red-700',
  dead: 'bg-red-50 text-red-700',
}

const ACTION_LABELS: Record<string, string> = {
  action_watered: 'water',
  action_pruned: 'gesnoeid',
  action_fed: 'voeding',
  action_cleaned: 'bladeren gereinigd',
  action_rotated: 'gedraaid',
  action_polished: 'bladglans',
  action_repotted: 'verpot',
  action_replaced: 'vervangen',
}

function plantTitle(plant: PublicPlant): string {
  return (
    plant.nickname ||
    plant.species ||
    plant.reference_code ||
    plant.plant_code ||
    'Plant'
  )
}

function deriveStatusKey(plant: PublicPlant): string {
  if (plant.is_dead) return 'dead'
  if (plant.needs_replacement) return 'replacement_needed'
  if (plant.is_dying) return 'replacement_needed'
  return plant.status || 'healthy'
}

function deriveMood(plant: PublicPlant): PlantMood {
  if (plant.is_dead || plant.status === 'dead') return 'dead'
  if (plant.needs_replacement || plant.is_dying) return 'dying'
  if (
    plant.status === 'needs_attention' ||
    plant.status === 'maintenance_due' ||
    plant.status === 'replacement_needed'
  )
    return 'needs-attention'
  return 'healthy'
}

async function lookupPlant(slug: string): Promise<PublicPlant | null> {
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
        'id, qr_slug, nickname, plant_code, reference_code, species, status, photo_url, is_dead, is_dying, needs_replacement'
      )
      .eq('qr_slug', slug)
      .maybeSingle()

    if (error || !data) return null
    return data as PublicPlant
  } catch {
    return null
  }
}

async function lookupLatestVisit(plantId: string): Promise<LatestVisit | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('maintenance_visit_plants')
      .select(
        `action_watered, action_pruned, action_fed, action_cleaned,
         action_rotated, action_polished, action_repotted, action_replaced,
         maintenance_visits ( ended_at, scheduled_start )`
      )
      .eq('plant_id', plantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return null

    const row = data as any
    const visit = Array.isArray(row.maintenance_visits)
      ? row.maintenance_visits[0]
      : row.maintenance_visits

    const performedAt = visit?.ended_at || visit?.scheduled_start || null

    const actions = Object.entries(ACTION_LABELS)
      .filter(([key]) => Boolean(row[key]))
      .map(([, label]) => label)

    return { performed_at: performedAt, actions }
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

  if (!plant) {
    return {
      title: 'Plant',
      description: 'Plantinformatie via Stera Pro QR-code.',
    }
  }

  return {
    title: plantTitle(plant),
    description: 'Plantinformatie via Stera Pro QR-code.',
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink flex flex-col">
      <header className="px-5 py-3 sm:px-10 sm:py-6 border-b border-stera-line">
        <span className="inline-flex items-baseline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/stera-logo.png"
            alt="Stera"
            className="h-9 sm:h-11 w-auto select-none"
          />
        </span>
      </header>
      <div className="flex-1 px-5 py-4 sm:px-10 sm:py-12">{children}</div>
      <footer className="px-5 py-3 sm:px-10 text-[10px] sm:text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}

function NotFoundView({ slug }: { slug: string }) {
  return (
    <Shell>
      <div className="mx-auto w-full max-w-xl">
        <p className="stera-eyebrow text-stera-green mb-4">QR-code · Niet gevonden</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          QR-code niet herkend
        </h1>
        <p className="text-base text-stera-ink-soft leading-relaxed mb-3">
          We konden geen plant vinden voor deze QR-code. De plant is mogelijk
          verwijderd, of de code is nog niet aan een plant gekoppeld in Stera Pro.
        </p>
        <p className="text-sm text-stera-ink-soft mb-10">
          Gescande code:{' '}
          <span className="font-mono text-stera-ink break-all">{slug}</span>
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/" className="stera-cta stera-cta-secondary">
            Terug naar start →
          </Link>
        </div>
      </div>
    </Shell>
  )
}

function formatDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function PublicPlantPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const plant = await lookupPlant(slug)

  if (!plant) {
    return <NotFoundView slug={slug} />
  }

  const latestVisit = await lookupLatestVisit(plant.id)
  const statusKey = deriveStatusKey(plant)
  const statusLabel = STATUS_LABELS[statusKey] || 'Gezond'
  const statusTone = STATUS_TONES[statusKey] || STATUS_TONES.healthy
  const lastDate = formatDate(latestVisit?.performed_at ?? null)

  return (
    <Shell>
      <div className="mx-auto w-full max-w-md space-y-3 sm:space-y-5">
        <div className="flex items-center justify-center gap-3">
          <AnimatedPlant
            mood={deriveMood(plant)}
            seed={plant.qr_slug || plant.id}
            className="max-w-[120px] sm:max-w-[180px]"
          />
          <div className="min-w-0 flex-1 text-left">
            <h1 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl">
              {plantTitle(plant)}
            </h1>
            <span
              className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusTone}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {plant.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={plant.photo_url}
            alt={plantTitle(plant)}
            className="h-44 w-full rounded-2xl border border-stera-line object-cover sm:h-56"
          />
        ) : (
          <div className="h-44 w-full rounded-2xl border border-dashed border-stera-line bg-white/60 flex items-center justify-center text-sm text-stera-ink-soft sm:h-56">
            Geen foto beschikbaar
          </div>
        )}

        <div className="rounded-xl border border-stera-line bg-white p-3">
          <p className="stera-eyebrow text-stera-green text-[10px]">
            Laatste onderhoud
          </p>
          {lastDate ? (
            <>
              <p className="mt-0.5 text-sm font-medium text-stera-ink">
                {lastDate}
              </p>
              {latestVisit?.actions && latestVisit.actions.length > 0 ? (
                <p className="mt-0.5 line-clamp-1 text-xs text-stera-ink-soft">
                  {latestVisit.actions.join(' · ')}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-0.5 text-sm text-stera-ink-soft">
              Nog geen onderhoud geregistreerd.
            </p>
          )}
        </div>

        <details className="rounded-xl border border-stera-line bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-stera-green">
            Iets opgevallen? Meld het hier →
          </summary>
          <div className="border-t border-stera-line p-4">
            <PlantReportForm slug={slug} />
          </div>
        </details>
      </div>
    </Shell>
  )
}
