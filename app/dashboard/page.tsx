import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  const [
    { count: companiesCount },
    { count: plannedCount },
    { count: completedCount },
    { count: plantsCount },
  ] = await Promise.all([
    supabase.from('companies').select('id', { count: 'exact', head: true }),
    supabase
      .from('maintenance_visits')
      .select('id', { count: 'exact', head: true })
      .in('status', ['scheduled', 'in_progress', 'paused'])
      .gte('scheduled_start', todayIso),
    supabase
      .from('maintenance_visits')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed'),
    supabase.from('plants').select('id', { count: 'exact', head: true }),
  ])

  const tiles: Array<{
    href: string
    eyebrow: string
    title: string
    description: string
    badge?: string | null
  }> = [
    {
      href: '/scan',
      eyebrow: 'Scan',
      title: 'Plant scannen',
      description: 'Open meteen een plantfiche door de QR-code te scannen.',
    },
    {
      href: '/plants/search',
      eyebrow: 'Zoeken',
      title: 'Plant opzoeken',
      description: 'Zoek op bijnaam, soort, referentiecode of QR-slug.',
    },
    {
      href: '/maintenance?tab=planned',
      eyebrow: 'Onderhoud',
      title: 'Geplande onderhouden',
      description: 'Bekijk wat eraan komt of start een lopende beurt.',
      badge: plannedCount ? `${plannedCount} gepland` : null,
    },
    {
      href: '/maintenance?tab=completed',
      eyebrow: 'Rapporten',
      title: 'Voltooide beurten',
      description: 'Open een afgeronde beurt en het bijhorende klantrapport.',
      badge: completedCount ? `${completedCount} voltooid` : null,
    },
    {
      href: '/companies',
      eyebrow: 'Klanten',
      title: 'Bedrijven',
      description: 'Beheer bedrijven, locaties en ruimtes.',
      badge: companiesCount ? `${companiesCount} bedrijven` : null,
    },
    {
      href: '/maintenance/new',
      eyebrow: 'Nieuw',
      title: 'Onderhoud plannen',
      description: 'Maak een nieuwe afspraak met cascade bedrijf → locatie.',
    },
  ]

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="stera-eyebrow mb-2">Dashboard</p>
            <h1 className="stera-display text-4xl sm:text-5xl">
              Stera<span className="text-stera-green"> Pro</span>
            </h1>
            <p className="mt-3 text-sm text-stera-ink-soft">
              Ingelogd als {user.email}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-right text-xs text-stera-ink-soft sm:grid-cols-4">
            <Stat label="Bedrijven" value={companiesCount ?? 0} />
            <Stat label="Locaties" value={null /* niet uitgelicht */} hide />
            <Stat label="Planten" value={plantsCount ?? 0} />
            <Stat label="Voltooid" value={completedCount ?? 0} />
          </div>
        </div>

        <section>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((tile) => (
              <li key={tile.href}>
                <Link
                  href={tile.href}
                  className="stera-card flex h-full flex-col justify-between transition hover:border-stera-green"
                >
                  <div>
                    <p className="stera-eyebrow mb-2">{tile.eyebrow}</p>
                    <h2 className="text-xl font-bold text-stera-ink">
                      {tile.title}
                    </h2>
                    <p className="mt-2 text-sm text-stera-ink-soft">
                      {tile.description}
                    </p>
                  </div>
                  {tile.badge ? (
                    <p className="mt-4 inline-flex items-center self-start rounded-full bg-stera-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stera-green">
                      {tile.badge}
                    </p>
                  ) : (
                    <span className="mt-4 inline-flex items-center self-start text-sm text-stera-green">
                      Openen →
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}

function Stat({
  label,
  value,
  hide = false,
}: {
  label: string
  value: number | null
  hide?: boolean
}) {
  if (hide) return <div />
  return (
    <div className="rounded-lg border border-stera-line bg-white px-3 py-2 text-left">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
        {label}
      </p>
      <p className="text-lg font-bold text-stera-ink">{value ?? 0}</p>
    </div>
  )
}
