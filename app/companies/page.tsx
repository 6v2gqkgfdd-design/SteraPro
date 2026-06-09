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

  const { count: pendingPortal } = await supabase
    .from('portal_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-6 sm:pt-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="sticky top-0 z-20 -mx-5 -mt-3 flex flex-wrap items-center justify-between gap-3 bg-stera-cream/95 px-5 pt-3 pb-3 backdrop-blur sm:static sm:mx-0 sm:mt-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <h1 className="font-serif text-3xl leading-none text-stera-green sm:text-4xl">
            Klanten <span className="align-middle text-xl text-stera-ink-soft">{count}</span>
          </h1>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/portal-aanvragen"
              className="stera-cta stera-cta-ghost relative"
            >
              Klantenportaal
              {pendingPortal && pendingPortal > 0 ? (
                <span className="ml-2 rounded-full bg-stera-green px-1.5 text-xs font-semibold text-white">
                  {pendingPortal}
                </span>
              ) : null}
            </Link>
            <Link href="/companies/new" className="stera-cta stera-cta-primary">
              + Nieuwe klant
            </Link>
          </div>
        </div>

        {error ? (
          <p className="text-red-600">Fout bij ophalen: {error.message}</p>
        ) : !companies || companies.length === 0 ? (
          <div className="stera-empty space-y-3">
            <p className="stera-empty-title">Nog geen klanten</p>
            <p className="text-sm">
              Voeg je eerste klant toe om locaties, ruimtes en planten te
              beginnen beheren.
            </p>
            <div>
              <Link
                href="/companies/new"
                className="stera-cta stera-cta-primary"
              >
                + Eerste klant toevoegen
              </Link>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {companies.map((c) => (
              <li
                key={c.id}
                className="stera-card transition hover:border-stera-green"
              >
                <Link href={`/companies/${c.id}`} className="block">
                  <p className="font-serif text-xl text-stera-green">{c.name}</p>
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
