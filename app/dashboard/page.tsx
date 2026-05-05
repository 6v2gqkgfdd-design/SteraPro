import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SteraLogo from '@/components/stera-logo'

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

  const maintenanceBadge =
    plannedCount && completedCount
      ? `${plannedCount} gepland · ${completedCount} voltooid`
      : plannedCount
        ? `${plannedCount} gepland`
        : completedCount
          ? `${completedCount} voltooid`
          : null

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
      badge: plantsCount ? `${plantsCount} planten` : null,
    },
    {
      href: '/maintenance',
      eyebrow: 'Onderhoud',
      title: 'Onderhoud',
      description:
        'Plan een afspraak in, bekijk geplande beurten of open afgeronde rapporten.',
      badge: maintenanceBadge,
    },
    {
      href: '/companies',
      eyebrow: 'Klanten',
      title: 'Bedrijven',
      description: 'Beheer bedrijven, locaties en ruimtes.',
      badge: companiesCount ? `${companiesCount} bedrijven` : null,
    },
  ]

  return (
    <main className="bg-stera-cream px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl space-y-10">
        <div>
          <p className="stera-eyebrow mb-3">Home</p>
          <SteraLogo variant="hero" href={null} />
          <p className="mt-4 text-base text-stera-ink-soft">
            Ingelogd als {user.email}
          </p>
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

