import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DeleteCompanyButton from '@/components/delete-company-button'
import { RowMenu, RowMenuItem } from '@/components/row-menu'
import { Breadcrumbs } from '@/components/breadcrumbs'

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

  // Gestorven planten van deze klant — voor de "Te vervangen"-sectie.
  const { data: deadPlants } = await supabase
    .from('plants')
    .select(
      'id, nickname, species, reference_code, photo_url, status, location_id, room_id, rooms ( name, floor )'
    )
    .eq('company_id', id)
    .eq('status', 'dead')
    .order('updated_at', { ascending: false })

  return (
    <main className="stera-page-pb bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="space-y-2">
          <Breadcrumbs
            items={[
              { label: 'Klanten', href: '/companies' },
              { label: company.name },
            ]}
          />
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
          <div className="stera-empty space-y-3">
            <p className="stera-empty-title">Nog geen locaties</p>
            <p className="text-sm">
              Voeg een locatie toe — bijvoorbeeld een kantoorgebouw of
              winkelpand — om ruimtes en planten te beheren.
            </p>
            <div>
              <Link
                href={`/companies/${company.id}/locations/new`}
                className="stera-cta stera-cta-primary"
              >
                + Eerste locatie toevoegen
              </Link>
            </div>
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

        {deadPlants && deadPlants.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="stera-eyebrow text-red-700">
                Gestorven planten ({deadPlants.length})
              </p>
              <span className="text-xs text-stera-ink-soft">
                Te vervangen — offerte opmaken
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {deadPlants.map((plant: any) => {
                const r = Array.isArray(plant.rooms)
                  ? plant.rooms[0]
                  : plant.rooms
                return (
                  <li key={plant.id}>
                    <Link
                      href={`/plants/${plant.id}`}
                      className="flex gap-3 rounded-xl border border-red-200 bg-red-50/40 p-3 transition hover:border-red-400"
                    >
                      {plant.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={plant.photo_url}
                          alt={plant.nickname || 'Plant'}
                          className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-red-100 text-xl">
                          🥀
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-stera-ink">
                          {plant.nickname || plant.species || 'Plant'}
                        </p>
                        {plant.species && plant.nickname ? (
                          <p className="truncate text-xs text-stera-ink-soft">
                            {plant.species}
                          </p>
                        ) : null}
                        {r?.name ? (
                          <p className="truncate text-xs text-stera-ink-soft">
                            {r.name}
                            {r.floor && /^\d+$/.test(String(r.floor).trim())
                              ? ` · Verdiep ${r.floor}`
                              : r.floor
                                ? ` · ${r.floor}`
                                : ''}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  )
}
