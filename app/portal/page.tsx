import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type PortalRow = { company_id: string | null; company_name: string | null; status: string }

export default async function PortalHome() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const { data } = await supabase.rpc('my_portal_company')
  const row = (Array.isArray(data) ? data[0] : null) as PortalRow | null

  // Nog niet geregistreerd → registratieformulier.
  if (!row) redirect('/portal/registreren')

  // Wel aangevraagd, nog niet goedgekeurd.
  if (row.status !== 'approved' || !row.company_id) {
    return (
      <Shell email={user.email ?? ''}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="stera-eyebrow text-amber-700 mb-2">In behandeling</p>
          <h1 className="text-2xl font-bold">Je aanvraag is ontvangen</h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Stera Pro bekijkt je registratie en activeert je toegang zo snel
            mogelijk. Je krijgt bericht zodra je portaal klaarstaat.
          </p>
        </div>
      </Shell>
    )
  }

  // Goedgekeurd → portaal-menu.
  const tiles: Array<{ href: string; title: string; desc: string; icon: string; soon?: boolean }> = [
    { href: '/portal/profiel', title: 'Mijn gegevens', desc: 'Bedrijfs- en contactgegevens bekijken en wijzigen', icon: '👤' },
    { href: '/catalog', title: 'Webshop', desc: 'Bekijk het assortiment en bestel planten', icon: '🛒' },
    { href: '/portal/onderhoud', title: 'Onderhoud', desc: 'Je planten en onderhoudshistorie', icon: '🌿', soon: true },
    { href: '/portal/werkbonnen', title: 'Werkbonnen', desc: 'Rapporten van uitgevoerde bezoeken', icon: '📋', soon: true },
    { href: '/portal/offertes', title: 'Offertes', desc: 'Je voorstellen bekijken en goedkeuren', icon: '📄', soon: true },
    { href: '/portal/bestellingen', title: 'Bestellingen', desc: 'Je bestellingen en hun status', icon: '📦', soon: true },
  ]

  return (
    <Shell email={user.email ?? ''} company={row.company_name}>
      <div className="mb-6">
        <p className="stera-eyebrow text-stera-green mb-1">Welkom</p>
        <h1 className="text-2xl font-bold sm:text-3xl">
          {row.company_name || 'Je portaal'}
        </h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) =>
          t.soon ? (
            <div
              key={t.href}
              className="relative rounded-xl border border-stera-line bg-white/60 p-5 opacity-70"
            >
              <span className="absolute right-3 top-3 rounded-full bg-stera-ink/5 px-2 py-0.5 text-[10px] text-stera-ink/50">
                binnenkort
              </span>
              <div className="text-2xl">{t.icon}</div>
              <p className="mt-2 font-semibold text-stera-ink">{t.title}</p>
              <p className="mt-1 text-sm text-stera-ink-soft">{t.desc}</p>
            </div>
          ) : (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-xl border border-stera-line bg-white p-5 transition hover:border-stera-green hover:shadow-md"
            >
              <div className="text-2xl">{t.icon}</div>
              <p className="mt-2 font-semibold text-stera-ink">{t.title}</p>
              <p className="mt-1 text-sm text-stera-ink-soft">{t.desc}</p>
            </Link>
          )
        )}
      </div>
    </Shell>
  )
}

function Shell({
  children,
  email,
  company,
}: {
  children: React.ReactNode
  email: string
  company?: string | null
}) {
  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink">
      <header className="flex items-center justify-end px-5 py-4 sm:px-10">
        <div className="text-right text-xs text-stera-ink-soft">
          {company ? <div className="font-medium text-stera-ink">{company}</div> : null}
          <div>{email}</div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-10">{children}</div>
    </main>
  )
}
