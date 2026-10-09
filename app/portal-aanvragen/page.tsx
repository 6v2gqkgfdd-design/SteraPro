import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ApproveList from './approve-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Portaal-aanvragen' }

export default async function PortalRequestsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: contacts }, { data: companies }, requestsRes] = await Promise.all([
    supabase
      .from('portal_contacts')
      .select('id, email, request_data, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name').order('name'),
    supabase
      .from('portal_requests')
      .select(
        'id, contact_email, species, quantity, location_note, message, status, created_at, companies(name)'
      )
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const plantRequests = (requestsRes.error ? [] : requestsRes.data ?? []) as Array<{
    id: string
    contact_email: string
    species: string | null
    quantity: string | null
    location_note: string | null
    message: string
    status: string
    created_at: string
    companies: { name: string | null } | { name: string | null }[] | null
  }>

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="stera-eyebrow text-stera-green mb-2">Klantenportaal</p>
          <h1 className="text-2xl font-bold tracking-tight text-stera-ink sm:text-3xl">
            Openstaande aanvragen
          </h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Koppel elke aanvraag aan een bestaand bedrijf of maak er een nieuw
            van. Daarna kan de klant inloggen op zijn portaal.
          </p>
        </div>
        <ApproveList
          contacts={(contacts ?? []) as never}
          companies={(companies ?? []) as never}
        />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stera-ink">Nieuwe planten</h2>
          <p className="text-sm text-stera-ink-soft">
            Aanvragen die klanten via het portaal instuurden. De status blijft
            op deze lijst staan.
          </p>
          {requestsRes.error ? (
            <p className="text-sm text-stera-ink-soft">
              De aanvragentabel is op deze database nog niet beschikbaar.
            </p>
          ) : plantRequests.length === 0 ? (
            <p className="text-sm text-stera-ink-soft">Nog geen plantaanvragen.</p>
          ) : (
            <ul className="space-y-3">
              {plantRequests.map((row) => {
                const company = Array.isArray(row.companies)
                  ? row.companies[0]
                  : row.companies
                return (
                  <li key={row.id} className="rounded-xl border border-stera-line bg-white p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-stera-ink">
                        {company?.name || row.contact_email}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-stera-ink-soft">
                        {row.status} · {new Date(row.created_at).toLocaleDateString('nl-BE')}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-stera-ink-soft">{row.contact_email}</p>
                    <p className="mt-2 text-sm text-stera-ink">
                      {[row.quantity, row.species].filter(Boolean).join(' × ') || 'Planten'}
                      {row.location_note ? ` · ${row.location_note}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-stera-ink-soft">{row.message}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
