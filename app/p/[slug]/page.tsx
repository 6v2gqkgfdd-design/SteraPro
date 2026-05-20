import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import AnimatedPlant from '@/components/animated-plant'
import {
  getMood,
  moodMessage,
  statusColor,
  statusLabel,
  type PlantOverviewPlant,
} from '@/components/plant-overview'

type LatestVisit = {
  performed_at: string | null
  action_watered: boolean | null
  action_pruned: boolean | null
  action_fed: boolean | null
  action_cleaned: boolean | null
  action_rotated: boolean | null
  action_repotted: boolean | null
  action_replaced: boolean | null
}

type PublicPlant = {
  id: string
  qr_slug: string | null
  nickname: string | null
  plant_code: string | null
  reference_code: string | null
  species: string | null
  status: string | null
  photo_url: string | null
  care_tips: string | null
  is_dead: boolean | null
  is_dying: boolean | null
  needs_replacement: boolean | null
  latest_visit: LatestVisit | null
  maintenance_photo_url: string | null
}

const ACTION_LABELS: Record<string, string> = {
  action_watered: 'water',
  action_fed: 'voeding',
  action_pruned: 'gesnoeid',
  action_rotated: 'gedraaid',
  action_cleaned: 'bladeren gereinigd',
  action_repotted: 'verpot',
  action_replaced: 'vervangen',
  // bladglans (action_polished) zit nu onder bladeren gereinigd
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

// Haalt één plant op via de publieke RPC get_public_plant. Die functie
// draait met verhoogde rechten (SECURITY DEFINER) zodat de klantweergave
// ook werkt voor bezoekers die niet ingelogd zijn — zonder de plants-
// tabel zelf open te zetten voor anonieme toegang.
async function getPublicPlant(slug: string): Promise<PublicPlant | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_public_plant', {
      _slug: slug,
    })

    if (error || !data) return null
    return data as PublicPlant
  } catch {
    return null
  }
}

function visitActions(visit: LatestVisit | null): string[] {
  if (!visit) return []
  return Object.entries(ACTION_LABELS)
    .filter(([key]) => Boolean((visit as Record<string, unknown>)[key]))
    .map(([, label]) => label)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const plant = await getPublicPlant(slug)

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
        <Link href="/dashboard" className="inline-flex items-baseline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/stera-logo.png"
            alt="Stera"
            className="h-9 sm:h-11 w-auto select-none"
          />
        </Link>
      </header>
      <div className="flex-1 px-5 py-4 sm:px-10 sm:py-12">{children}</div>
      <footer className="px-5 py-1.5 text-center text-[10px] leading-tight text-stera-ink-soft sm:border-t sm:border-stera-line sm:px-10 sm:py-3 sm:text-left sm:text-xs">
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
  const plant = await getPublicPlant(slug)

  if (!plant) {
    return <NotFoundView slug={slug} />
  }

  const latestVisit = plant.latest_visit
  const lastDate = formatDate(latestVisit?.performed_at ?? null)
  const actions = visitActions(latestVisit)

  // Toon bij voorkeur de laatste onderhoudsfoto; val terug op de
  // oorspronkelijke plantfoto als er nog geen onderhoudsfoto is.
  const displayPhoto = plant.maintenance_photo_url ?? plant.photo_url

  // Hergebruik dezelfde statusLabel/statusColor/mood-logica als de
  // interne plant-detail pagina zodat de header er identiek uitziet.
  const overviewPlant = {
    ...plant,
    notes: null,
    location_id: null,
    is_artificial: false,
  } as PlantOverviewPlant

  return (
    <Shell>
      <div className="mx-auto w-full max-w-md space-y-3 sm:space-y-5">
        {(() => {
          const mood = getMood(overviewPlant)
          const ringClass =
            mood === 'healthy'
              ? 'ring-stera-green'
              : mood === 'needs-attention'
                ? 'ring-amber-500'
                : mood === 'dying'
                  ? 'ring-orange-500'
                  : 'ring-red-500'
          const title = plantTitle(plant)
          return (
            <div className="flex items-center gap-3">
              <div
                className={`w-11 shrink-0 rounded-full bg-white ring-2 ring-offset-2 ring-offset-stera-cream sm:w-14 ${ringClass}`}
              >
                <AnimatedPlant
                  mood={mood}
                  seed={plant.qr_slug || plant.id}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                  {title}
                </h1>
                {plant.species && plant.species !== title ? (
                  <p className="mt-0.5 text-sm text-stera-ink-soft">
                    {plant.species}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-stera-ink-soft">
                  {moodMessage(mood, title)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div
                    className={`inline-flex items-center border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusColor(overviewPlant)}`}
                  >
                    {statusLabel(overviewPlant)}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {displayPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayPhoto}
            alt={plantTitle(plant)}
            className="aspect-square w-full rounded-2xl border border-stera-line object-cover sm:aspect-auto sm:max-h-[460px] sm:object-contain"
          />
        ) : (
          <div className="aspect-square w-full rounded-2xl border border-dashed border-stera-line bg-white/60 flex items-center justify-center text-sm text-stera-ink-soft sm:aspect-[4/3]">
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
              {actions.length > 0 ? (
                <p className="mt-0.5 line-clamp-1 text-xs text-stera-ink-soft">
                  {actions.join(' · ')}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-0.5 text-sm text-stera-ink-soft">
              Nog geen onderhoud geregistreerd.
            </p>
          )}
        </div>

        {plant.care_tips && plant.care_tips.trim() ? (
          <div className="rounded-xl border border-stera-line bg-white p-3">
            <p className="stera-eyebrow text-stera-green text-[10px]">
              Verzorgingstips
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stera-ink">
              {plant.care_tips}
            </p>
          </div>
        ) : null}

        <Link
          href={`/p/${slug}/report`}
          className="block rounded-xl border border-stera-line bg-white px-4 py-3 text-center text-sm font-medium text-stera-green transition hover:border-stera-green"
        >
          Iets opgevallen? Meld het hier →
        </Link>
      </div>
    </Shell>
  )
}
