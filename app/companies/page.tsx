import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CompaniesClient, {
  type CompanyListItem,
} from './CompaniesClient'

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const q = (params?.q || '').trim().toLowerCase()

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  const [
    { data: companies, error },
    { data: locations },
    { data: visits },
    { data: quotes },
    { count: pendingPortal },
  ] = await Promise.all([
    supabase
      .from('companies')
      .select(
        'id, name, contact_name, email, phone, has_maintenance_contract, city'
      )
      .order('name', { ascending: true }),
    supabase.from('locations').select('id, company_id, name'),
    supabase
      .from('maintenance_visits')
      .select('id, company_id, status, scheduled_start')
      .in('status', ['scheduled', 'in_progress', 'paused'])
      .order('scheduled_start', { ascending: true }),
    supabase
      .from('quotes')
      .select('id, company_id, status')
      .in('status', ['draft', 'sent', 'accepted']),
    supabase
      .from('portal_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  // Open werkbonnen (alle beurten — ook afgewerkte) → company via visit
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(
      `id, status, visit_id,
       maintenance_visits ( company_id )`
    )
    .in('status', ['draft', 'sent', 'signed'])

  // Map company_id → open WO counts
  type WoAgg = { draft: number; sent: number; signed: number }
  const woByCompany = new Map<string, WoAgg>()
  for (const wo of workOrders ?? []) {
    const v = Array.isArray(wo.maintenance_visits)
      ? wo.maintenance_visits[0]
      : wo.maintenance_visits
    const companyId = (v as { company_id?: string } | null)?.company_id
    if (!companyId) continue
    const cur = woByCompany.get(companyId) || { draft: 0, sent: 0, signed: 0 }
    if (wo.status === 'draft') cur.draft++
    else if (wo.status === 'sent') cur.sent++
    else if (wo.status === 'signed') cur.signed++
    woByCompany.set(companyId, cur)
  }

  const locCount = new Map<string, number>()
  for (const loc of locations ?? []) {
    const cid = loc.company_id as string
    locCount.set(cid, (locCount.get(cid) || 0) + 1)
  }

  const nextVisitByCompany = new Map<
    string,
    { id: string; scheduled_start: string | null }
  >()
  for (const v of visits ?? []) {
    const cid = v.company_id as string
    if (!cid || nextVisitByCompany.has(cid)) continue
    nextVisitByCompany.set(cid, {
      id: v.id,
      scheduled_start: v.scheduled_start,
    })
  }

  const openQuotesByCompany = new Map<string, number>()
  for (const qRow of quotes ?? []) {
    const cid = qRow.company_id as string
    if (!cid) continue
    openQuotesByCompany.set(cid, (openQuotesByCompany.get(cid) || 0) + 1)
  }

  let items: CompanyListItem[] = (companies ?? []).map((c) => {
    const wo = woByCompany.get(c.id) || { draft: 0, sent: 0, signed: 0 }
    const next = nextVisitByCompany.get(c.id)
    const openQuotes = openQuotesByCompany.get(c.id) || 0
    const openActions = wo.draft + wo.sent + wo.signed + openQuotes
    return {
      id: c.id,
      name: c.name,
      contactName: c.contact_name,
      email: c.email,
      phone: c.phone,
      city: c.city,
      hasContract: !!c.has_maintenance_contract,
      locationCount: locCount.get(c.id) || 0,
      nextVisitAt: next?.scheduled_start ?? null,
      nextVisitId: next?.id ?? null,
      woDraft: wo.draft,
      woSent: wo.sent,
      woSigned: wo.signed,
      openQuotes,
      openActions,
    }
  })

  if (q) {
    items = items.filter((c) => {
      const hay = [c.name, c.contactName, c.email, c.phone, c.city]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }

  // Open acties eerst, dan contract, dan naam
  items.sort((a, b) => {
    if (b.openActions !== a.openActions) return b.openActions - a.openActions
    if (a.hasContract !== b.hasContract) return a.hasContract ? -1 : 1
    return a.name.localeCompare(b.name, 'nl')
  })

  return (
    <CompaniesClient
      items={items}
      totalCount={companies?.length ?? 0}
      pendingPortal={pendingPortal ?? 0}
      initialQ={params?.q || ''}
      error={error?.message ?? null}
    />
  )
}
