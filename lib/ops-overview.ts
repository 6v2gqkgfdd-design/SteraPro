/**
 * Gedeelde “wat moet ik doen?”-tellingen over onderhoud, offertes en facturatie.
 * Gebruikt op Home en (optioneel) andere overzichtspagina’s.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type OpsSnapshot = {
  visitsToday: number
  visitsPlanned: number
  woDraft: number
  woSent: number
  woSigned: number
  woInvoiced: number
  woArchived: number
  quotesDraft: number
  quotesSent: number
  quotesAccepted: number
  openReports: number
  /** Beurten met te vervangen planten, nog zonder offerte */
  openProposals: number
  actionTotal: number
}

export async function loadOpsSnapshot(
  supabase: SupabaseClient
): Promise<OpsSnapshot> {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)

  const [
    { count: visitsToday },
    { count: visitsPlanned },
    { data: woRows },
    { data: quoteRows },
    { count: openReports },
    { data: flaggedRows },
    { data: quotedVisitRows },
  ] = await Promise.all([
    supabase
      .from('maintenance_visits')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_start', startOfToday.toISOString())
      .lt('scheduled_start', startOfTomorrow.toISOString())
      .in('status', ['scheduled', 'in_progress', 'paused']),
    supabase
      .from('maintenance_visits')
      .select('id', { count: 'exact', head: true })
      .in('status', ['scheduled', 'in_progress', 'paused']),
    supabase.from('work_orders').select('status'),
    supabase.from('quotes').select('status'),
    supabase
      .from('plant_reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'seen']),
    supabase
      .from('maintenance_visit_plants')
      .select('visit_id')
      .eq('followup_replace', true),
    supabase
      .from('quotes')
      .select('source_visit_id')
      .not('source_visit_id', 'is', null),
  ])

  const wo = { draft: 0, sent: 0, signed: 0, invoiced: 0, archived: 0 }
  for (const r of woRows ?? []) {
    const s = (r as { status: string }).status
    if (s in wo) wo[s as keyof typeof wo]++
  }

  const quotes = { draft: 0, sent: 0, accepted: 0 }
  for (const r of quoteRows ?? []) {
    const s = (r as { status: string }).status
    if (s === 'draft') quotes.draft++
    else if (s === 'sent') quotes.sent++
    else if (s === 'accepted') quotes.accepted++
  }

  const quoted = new Set(
    (quotedVisitRows ?? [])
      .map((r: { source_visit_id: string | null }) => r.source_visit_id)
      .filter(Boolean) as string[]
  )
  const proposalVisits = new Set<string>()
  for (const row of flaggedRows ?? []) {
    const vid = (row as { visit_id: string }).visit_id
    if (vid && !quoted.has(vid)) proposalVisits.add(vid)
  }

  const actionTotal =
    (visitsToday ?? 0) +
    wo.draft +
    wo.sent +
    wo.signed +
    quotes.draft +
    quotes.sent +
    (openReports ?? 0) +
    proposalVisits.size

  return {
    visitsToday: visitsToday ?? 0,
    visitsPlanned: visitsPlanned ?? 0,
    woDraft: wo.draft,
    woSent: wo.sent,
    woSigned: wo.signed,
    woInvoiced: wo.invoiced,
    woArchived: wo.archived,
    quotesDraft: quotes.draft,
    quotesSent: quotes.sent,
    quotesAccepted: quotes.accepted,
    openReports: openReports ?? 0,
    openProposals: proposalVisits.size,
    actionTotal,
  }
}
