import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function CompaniesPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, contact_name, email')
    .order('name', { ascending: true })

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-6">

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="stera-display text-3xl sm:text-4xl">Klanten</h1>
          </div>
          <Link href="/companies/new" className="stera-cta stera-cta-primary">
            Nieuwe klant
          </Link>
        </div>

        {error ? (
          <p className="text-red-600">
            Fout bij ophalen: {error.message}
          </p>
        ) : !companies || companies.length === 0 ? (
          <div className="stera-card">
            <p className="text-sm text-stera-ink-soft">
              Nog geen klanten toegevoegd.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {companies.map((c) => (
              <li
                key={c.id}
                className="stera-card transition hover:border-stera-green"
              >
                <Link href={`/companies/${c.id}`} className="block">
                  <p className="font-semibold text-stera-ink">{c.name}</p>
                  {c.contact_name && (
                    <p className="mt-1 text-sm text-stera-ink-soft">
                      {c.contact_name}
                    </p>
                  )}
                  {c.email && (
                    <p className="text-sm text-stera-ink-soft">{c.email}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
