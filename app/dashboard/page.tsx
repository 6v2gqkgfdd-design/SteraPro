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
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Stera Pro Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">
          Ingelogd als: {user.email}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/companies/new"
          className="inline-block rounded-lg bg-black px-4 py-2 text-white"
        >
          Nieuw bedrijf
        </Link>

        <Link
          href="/maintenance"
          className="inline-block rounded-lg border border-black px-4 py-2 text-black"
        >
          Onderhoud
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Bedrijven</h2>

        {companiesError ? (
          <p className="text-red-600">
            Fout bij ophalen bedrijven: {companiesError.message}
          </p>
        ) : !companies || companies.length === 0 ? (
          <p>Nog geen bedrijven toegevoegd.</p>
        ) : (
          <ul className="space-y-3">
            {companies.map((company) => (
              <li key={company.id} className="rounded-xl border p-4">
                <Link href={`/companies/${company.id}`} className="block">
                  <p className="font-semibold">{company.name}</p>

                  {company.contact_name && (
                    <p className="text-sm text-gray-600">
                      Contact: {company.contact_name}
                    </p>
                  )}

                  {company.email && (
                    <p className="text-sm text-gray-600">
                      E-mail: {company.email}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
