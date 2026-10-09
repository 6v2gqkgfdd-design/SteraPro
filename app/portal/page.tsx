import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasDemoPortalSession } from '@/lib/portal-demo'

export const dynamic = 'force-dynamic'

type PortalRow = { company_id: string | null; company_name: string | null; status: string }

export default async function PortalHome() {
  if (await hasDemoPortalSession()) redirect('/portal/dashboard')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const { data } = await supabase.rpc('my_portal_company')
  const row = (Array.isArray(data) ? data[0] : null) as PortalRow | null

  if (!row) redirect('/portal/registreren')
  if (row.status === 'approved' && row.company_id) redirect('/portal/dashboard')

  return (
    <main className="msp-root">
      <p className="msp-kicker">In behandeling</p>
      <h1 className="msp-title">Je aanvraag is ontvangen</h1>
      <p className="msp-lead">
        We bekijken je registratie en activeren je toegang zo snel mogelijk. Je krijgt bericht zodra
        Mijn SteraPro klaarstaat.
      </p>
      <p className="msp-help">{user.email}</p>
    </main>
  )
}
