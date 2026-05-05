import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import PlantOverview, {
  plantTitle,
  type PlantOverviewLocation,
  type PlantOverviewLog,
  type PlantOverviewPlant,
  type PlantOverviewRoom,
} from '@/components/plant-overview'

type PublicPlant = PlantOverviewPlant & { room_id?: string | null }

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
        'id, qr_slug, nickname, plant_code, reference_code, species, status, notes, photo_url, location_id, room_id, is_dead, is_dying, needs_replacement, care_tips'
      )
      .eq('qr_slug', slug)
      .maybeSingle()

    if (error || !data) return null
    return data as PublicPlant
  } catch {
    return null
  }
}

async function lookupLatestLog(plantId: string): Promise<PlantOverviewLog> {
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
    return (data as PlantOverviewLog) ?? null
  } catch {
    return null
  }
}

async function lookupLocation(
  locationId: string
): Promise<PlantOverviewLocation> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('locations')
      .select('id, name, street, number, postal_code, city, country')
      .eq('id', locationId)
      .maybeSingle()
    return (data as PlantOverviewLocation) ?? null
  } catch {
    return null
  }
}

async function lookupRoom(
  roomId: string
): Promise<PlantOverviewRoom> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('rooms')
      .select('id, name, floor')
      .eq('id', roomId)
      .maybeSingle()
    return (data as PlantOverviewRoom) ?? null
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
    description: plant.species
      ? `${plantTitle(plant)} — ${plant.species}. Plantinformatie via Stera Pro QR-code.`
      : 'Plantinformatie via Stera Pro QR-code.',
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink flex flex-col">
      <header className="px-5 py-5 sm:px-10 sm:py-8 border-b border-stera-line">
        <Link
          href="/"
          className="stera-wordmark text-stera-ink text-base sm:text-lg"
        >
          Stéra<span className="text-stera-green">Pro</span>
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
          <Link href="/login" className="stera-cta stera-cta-primary">
            Inloggen voor onderhoud →
          </Link>
          <Link href="/" className="stera-cta stera-cta-secondary">
            Terug naar start →
          </Link>
        </div>
      </div>
    </Shell>
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
    return <NotFoundView slug={slug} />
  }

  const [latestLog, location, room] = await Promise.all([
    lookupLatestLog(plant.id),
    plant.location_id ? lookupLocation(plant.location_id) : Promise.resolve(null),
    plant.room_id ? lookupRoom(plant.room_id) : Promise.resolve(null),
  ])

  return (
    <Shell>
      <PlantOverview
        plant={plant}
        location={location}
        room={room}
        latestLog={latestLog}
        actions={
          <>
            <Link href="/login" className="stera-cta stera-cta-primary">
              Inloggen voor onderhoud →
            </Link>
            <Link href="/" className="stera-cta stera-cta-secondary">
              Terug naar start →
            </Link>
          </>
        }
      />
    </Shell>
  )
}
