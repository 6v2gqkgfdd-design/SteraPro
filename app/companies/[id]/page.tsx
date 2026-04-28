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
    <main className="p-6 space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm underline">
          ← Terug naar dashboard
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">{company.name}</h1>

        {company.contact_name && (
          <p className="mt-2 text-gray-600">
            Contact: {company.contact_name}
          </p>
        )}

        {company.email && (
          <p className="text-gray-600">
            E-mail: {company.email}
          </p>
        )}

        {company.phone && (
          <p className="text-gray-600">
            Telefoon: {company.phone}
          </p>
        )}

        {company.notes && (
          <p className="mt-3 text-gray-700">
            {company.notes}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/companies/${company.id}/locations/new`}
          className="inline-block rounded-lg bg-black px-4 py-2 text-white"
        >
          Nieuwe locatie
        </Link>

        <DeleteCompanyButton companyId={company.id} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Locaties</h2>

        {locationsError ? (
          <p className="text-red-600">
            Fout bij ophalen locaties: {locationsError.message}
          </p>
        ) : !locations || locations.length === 0 ? (
          <p>Nog geen locaties toegevoegd.</p>
        ) : (
          <ul className="space-y-3">
            {locations.map((location) => (
              <li key={location.id} className="rounded-xl border p-4">
                <Link href={`/locations/${location.id}`} className="block">
                  <p className="font-semibold">{location.name}</p>

                  {location.floor && (
                    <p className="text-sm text-gray-600">
                      Verdieping: {location.floor}
                    </p>
                  )}

                  {location.room && (
                    <p className="text-sm text-gray-600">
                      Ruimte: {location.room}
                    </p>
                  )}

                  {location.notes && (
                    <p className="mt-2 text-sm text-gray-700">
                      {location.notes}
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
