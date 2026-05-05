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
  notes: string | null
  photo_url: string | null
  location_id: string | null
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

type Location = {
  id: string
  name: string | null
  floor: string | null
  room: string | null
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
        'id, qr_slug, nickname, plant_code, reference_code, species, status, notes, photo_url, location_id, is_dead, is_dying, needs_replacement'
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

async function lookupLocation(locationId: string): Promise<Location | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('locations')
      .select('id, name, floor, room')
      .eq('id', locationId)
      .maybeSingle()
    return (data as Location | null) ?? null
  } catch {
    return null
  }
}

function statusLabel(plant: Plant): string {
  if (plant.is_dead) return 'Plant is dood'
  if (plant.is_dying) return 'Plant is stervend'
  if (plant.needs_replacement) return 'Vervanging nodig'
  return 'Gezond'
}

function statusColor(plant: Plant): string {
  if (plant.is_dead) return 'bg-red-100 text-red-800 border-red-300'
  if (plant.is_dying) return 'bg-orange-100 text-orange-800 border-orange-300'
  if (plant.needs_replacement) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
  return 'bg-stera-blue/10 text-stera-blue border-stera-blue/30'
}

function plantTitle(plant: Plant): string {
  return (
    plant.nickname ||
    plant.species ||
    plant.plant_code ||
    plant.reference_code ||
    'Plant'
  )
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
    description: plant.species
      ? `${plantTitle(plant)} — ${plant.species}. Plantinformatie via Stera Pro QR-code.`
      : 'Plantinformatie via Stera Pro QR-code.',
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#F5F0E8] text-stera-ink flex flex-col">
      <header className="px-5 py-5 sm:px-10 sm:py-8 border-b border-stera-line">
        <Link href="/" className="stera-wordmark text-stera-ink text-base sm:text-lg">
          Stéra<span className="text-stera-blue">Pro</span>
        </Link>
      </header>
      <div className="flex-1 px-5 py-8 sm:px-10 sm:py-16">{children}</div>
      <footer className="px-5 py-5 sm:px-10 text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}

function NotFoundView({ slug }: { slug: string }) {
  return (
    <Shell>
      <div className="mx-auto w-full max-w-xl">
        <p className="stera-eyebrow text-stera-blue mb-4">QR-code · Niet gevonden</p>
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
          <Link
            href="/login"
            className="stera-cta inline-flex items-center justify-center bg-stera-blue px-6 py-4 text-sm text-white hover:bg-[#0010C0]"
          >
            Inloggen voor onderhoud →
          </Link>
          <Link
            href="/"
            className="stera-cta inline-flex items-center justify-center border border-stera-blue px-6 py-4 text-sm text-stera-ink hover:bg-stera-blue hover:text-white"
          >
            Terug naar start →
          </Link>
        </div>
      </div>
    </Shell>
  )
}

const TASK_LABELS: Array<{ key: keyof MaintenanceLog; label: string }> = [
  { key: 'watered', label: 'Water' },
  { key: 'pruned', label: 'Gesnoeid' },
  { key: 'dusted', label: 'Stofvrij' },
  { key: 'rotated', label: 'Gedraaid' },
  { key: 'fed', label: 'Voeding' },
  { key: 'pest_treated', label: 'Plagen' },
  { key: 'repotted', label: 'Verpot' },
  { key: 'soil_refreshed', label: 'Verse aarde' },
  { key: 'polished', label: 'Opgeblonken' },
]

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

  const [latestLog, location] = await Promise.all([
    lookupLatestLog(plant.id),
    plant.location_id ? lookupLocation(plant.location_id) : Promise.resolve(null),
  ])

  const title = plantTitle(plant)
  const performedTasks = latestLog
    ? TASK_LABELS.filter(({ key }) => latestLog[key])
    : []

  return (
    <Shell>
      <div className="mx-auto w-full max-w-2xl">
        <p className="stera-eyebrow text-stera-blue mb-3">Plant · QR-overzicht</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          {title}
        </h1>
        {plant.species && plant.species !== title && (
          <p className="text-base text-stera-ink-soft mb-5">{plant.species}</p>
        )}

        <div
          className={`inline-flex items-center border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusColor(plant)}`}
        >
          {statusLabel(plant)}
        </div>

        {plant.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={plant.photo_url}
            alt={title}
            className="mt-8 w-full max-h-[420px] object-cover border border-stera-line"
          />
        )}

        <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 border-t border-stera-line pt-6">
          {plant.reference_code && (
            <div>
              <dt className="stera-eyebrow text-stera-ink-soft">Referentie</dt>
              <dd className="mt-1 text-sm text-stera-ink font-mono">
                {plant.reference_code}
              </dd>
            </div>
          )}
          {plant.plant_code && plant.plant_code !== plant.reference_code && (
            <div>
              <dt className="stera-eyebrow text-stera-ink-soft">Plantcode</dt>
              <dd className="mt-1 text-sm text-stera-ink font-mono">
                {plant.plant_code}
              </dd>
            </div>
          )}
          {location?.name && (
            <div>
              <dt className="stera-eyebrow text-stera-ink-soft">Locatie</dt>
              <dd className="mt-1 text-sm text-stera-ink">
                {location.name}
                {(location.floor || location.room) && (
                  <span className="text-stera-ink-soft">
                    {' · '}
                    {[location.floor, location.room].filter(Boolean).join(' · ')}
                  </span>
                )}
              </dd>
            </div>
          )}
          {plant.status && (
            <div>
              <dt className="stera-eyebrow text-stera-ink-soft">Conditie</dt>
              <dd className="mt-1 text-sm text-stera-ink">{plant.status}</dd>
            </div>
          )}
        </dl>

        {plant.notes && (
          <section className="mt-8 border border-stera-line bg-white p-5 sm:p-6">
            <h2 className="stera-eyebrow text-stera-blue mb-3">Notities</h2>
            <p className="text-sm text-stera-ink leading-relaxed whitespace-pre-wrap">
              {plant.notes}
            </p>
          </section>
        )}

        <section className="mt-8 border border-stera-line bg-white p-5 sm:p-6">
          <h2 className="stera-eyebrow text-stera-blue mb-3">Laatste onderhoud</h2>
          {latestLog ? (
            <>
              <p className="text-sm text-stera-ink-soft">
                {new Date(latestLog.performed_at).toLocaleString('nl-BE', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })}
              </p>
              {performedTasks.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {performedTasks.map(({ key, label }) => (
                    <span
                      key={key}
                      className="border border-stera-line px-2 py-1 uppercase tracking-wider"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-stera-ink-soft">
                  Geen specifieke handelingen geregistreerd.
                </p>
              )}
              {latestLog.notes && (
                <p className="mt-4 text-sm text-stera-ink-soft leading-relaxed whitespace-pre-wrap">
                  {latestLog.notes}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-stera-ink-soft">
              Nog geen onderhoud geregistreerd voor deze plant.
            </p>
          )}
        </section>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link
            href="/login"
            className="stera-cta inline-flex items-center justify-center bg-stera-blue px-6 py-4 text-sm text-white hover:bg-[#0010C0]"
          >
            Inloggen voor onderhoud →
          </Link>
          <Link
            href="/"
            className="stera-cta inline-flex items-center justify-center border border-stera-blue px-6 py-4 text-sm text-stera-ink hover:bg-stera-blue hover:text-white"
          >
            Terug naar start →
          </Link>
        </div>

        <p className="mt-8 text-xs text-stera-ink-soft">
          QR-slug: <span className="font-mono break-all">{plant.qr_slug}</span>
        </p>
      </div>
    </Shell>
  )
}
