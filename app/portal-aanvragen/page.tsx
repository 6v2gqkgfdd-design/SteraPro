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

  const [{ data: contacts }, { data: companies }] = await Promise.all([
    supabase
      .from('portal_contacts')
      .select('id, email, request_data, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name').order('name'),
  ])

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
      </div>
    </main>
  )
}
