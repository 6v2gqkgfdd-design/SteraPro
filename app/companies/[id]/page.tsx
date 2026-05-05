import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteCompanyButton from '@/components/delete-company-button'

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
      <div className="mx-auto max-w-4xl space-y-6">

        <div>
          <p className="stera-eyebrow mb-2">Klant</p>
          <h1 className="stera-display text-3xl sm:text-4xl">{company.name}</h1>

          <div className="mt-3 space-y-1 text-sm text-stera-ink-soft">
            {company.contact_name && <p>Contact: {company.contact_name}</p>}
            {company.email && <p>E-mail: {company.email}</p>}
            {company.phone && <p>Telefoon: {company.phone}</p>}
          </div>

          {company.notes && (
            <p className="mt-3 text-sm text-stera-ink-soft">
              {company.notes}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/companies/${company.id}/locations/new`}
            className="stera-cta stera-cta-primary"
          >
            Nieuwe locatie
          </Link>

          <Link
            href={`/companies/${company.id}/edit`}
            className="stera-cta stera-cta-secondary"
          >
            Klant bewerken
          </Link>

          <DeleteCompanyButton companyId={company.id} />
        </div>

        <section className="space-y-3">
          <p className="stera-eyebrow">Locaties</p>

          {locationsError ? (
            <p className="text-red-600">
              Fout bij ophalen locaties: {locationsError.message}
            </p>
          ) : !locations || locations.length === 0 ? (
            <div className="stera-card">
              <p className="text-sm text-stera-ink-soft">Nog geen locaties toegevoegd.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {locations.map((location) => (
                <li key={location.id} className="stera-card transition hover:border-stera-green">
                  <Link href={`/locations/${location.id}`} className="block">
                    <p className="font-semibold text-stera-ink">{location.name}</p>

                    {location.floor && (
                      <p className="mt-1 text-sm text-stera-ink-soft">
                        Verdieping: {location.floor}
                      </p>
                    )}

                    {location.room && (
                      <p className="text-sm text-stera-ink-soft">
                        Ruimte: {location.room}
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
        </section>
      </div>
    </main>
  )
}
