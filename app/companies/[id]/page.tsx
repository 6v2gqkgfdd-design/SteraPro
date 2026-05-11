import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteCompanyButton from '@/components/delete-company-button'
import { RowMenu, RowMenuItem } from '@/components/row-menu'

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (companyError || !company) {
    notFound()
  }

  const { data: locations, error: locationsError } = await supabase
    .from('locations')
    .select('*')
    .eq('company_id', id)
    .order('created_at', { ascending: false })

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="space-y-1">
          <p className="text-xs text-stera-ink-soft">
            <Link href="/companies" className="hover:text-stera-green">
              ← Klanten
            </Link>
          </p>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-stera-ink sm:text-3xl">
                  {company.name}
                </h1>
                {company.has_maintenance_contract ? (
                  <span className="rounded-full bg-stera-green/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-stera-green">
                    Contract
                  </span>
                ) : null}
              </div>
              {(company.contact_name || company.email || company.phone) && (
                <p className="mt-1 text-sm text-stera-ink-soft">
                  {[company.contact_name, company.email, company.phone]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {company.notes && (
                <p className="mt-1 text-sm text-stera-ink-soft">
                  {company.notes}
                </p>
              )}
            </div>
            <RowMenu>
              <RowMenuItem href={`/companies/${company.id}/edit`}>
                Bewerken
              </RowMenuItem>
              <div className="border-t border-stera-line" />
              <DeleteCompanyButton companyId={company.id} variant="menu" />
            </RowMenu>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-stera-green px-4 py-2.5 text-sm font-semibold text-white">
            Locaties
            <span className="ml-2 opacity-70">{locations?.length ?? 0}</span>
          </span>
          <Link
            href={`/companies/${company.id}/locations/new`}
            className="stera-cta stera-cta-primary"
          >
            + Nieuwe locatie
          </Link>
        </div>

        {locationsError ? (
          <p className="text-red-600">
            Fout bij ophalen locaties: {locationsError.message}
          </p>
        ) : !locations || locations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stera-line p-6 text-center text-sm text-stera-ink-soft">
            Nog geen locaties.
          </div>
        ) : (
          <ul className="space-y-3">
            {locations.map((location) => (
              <li
                key={location.id}
                className="stera-card transition hover:border-stera-green"
              >
                <Link href={`/locations/${location.id}`} className="block">
                  <p className="font-semibold text-stera-ink">
                    {location.name}
                  </p>
                  {(location.street || location.city) && (
                    <p className="mt-1 text-sm text-stera-ink-soft">
                      {[
                        [location.street, location.number]
                          .filter(Boolean)
                          .join(' '),
                        location.city,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {location.notes && (
                    <p className="mt-2 text-sm text-stera-ink-soft">
                      {location.notes}
                    </p>
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
