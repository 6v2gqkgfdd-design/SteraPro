import { redirect } from 'next/navigation'
import Link from 'next/link'
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

  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="stera-eyebrow mb-2">Dashboard</p>
            <h1 className="stera-display text-4xl sm:text-5xl">
              Stera<span className="text-stera-blue"> Pro</span>
            </h1>
            <p className="mt-3 text-sm text-stera-ink-soft">
              Ingelogd als {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/companies/new"
              className="stera-cta stera-cta-primary"
            >
              Nieuw bedrijf
            </Link>
            <Link
              href="/maintenance"
              className="stera-cta stera-cta-secondary"
            >
              Onderhoud
            </Link>
          </div>
        </div>

        <section className="space-y-4">
          <p className="stera-eyebrow">Bedrijven</p>

          {companiesError ? (
            <p className="text-red-600">
              Fout bij ophalen bedrijven: {companiesError.message}
            </p>
          ) : !companies || companies.length === 0 ? (
            <div className="stera-card">
              <p className="text-sm text-stera-ink-soft">
                Nog geen bedrijven toegevoegd. Klik op{' '}
                <span className="font-semibold">Nieuw bedrijf</span> om te starten.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {companies.map((company) => (
                <li key={company.id} className="stera-card transition hover:border-stera-blue">
                  <Link href={`/companies/${company.id}`} className="block">
                    <p className="font-semibold text-stera-ink">{company.name}</p>

                    {company.contact_name && (
                      <p className="mt-1 text-sm text-stera-ink-soft">
                        {company.contact_name}
                      </p>
                    )}

                    {company.email && (
                      <p className="text-sm text-stera-ink-soft">
                        {company.email}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
