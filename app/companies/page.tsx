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

  const count = companies?.length ?? 0

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-stera-green px-4 py-2.5 text-sm font-semibold text-white">
            Klanten<span className="ml-2 opacity-70">{count}</span>
          </span>
          <Link href="/companies/new" className="stera-cta stera-cta-primary">
            + Nieuwe klant
          </Link>
        </div>

        {error ? (
          <p className="text-red-600">Fout bij ophalen: {error.message}</p>
        ) : !companies || companies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stera-line p-6 text-center text-sm text-stera-ink-soft">
            Nog geen klanten.
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
