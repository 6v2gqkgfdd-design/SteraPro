/**
 * Gedeelde “wat moet ik doen?”-tellingen over onderhoud en facturatie.
 * Gebruikt op Home. Offertes/vervangingen horen hier niet meer:
 * vervangingen lopen later via het klantportaal → Shopify.
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
  openReports: number
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
    { count: openReports },
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
    supabase
      .from('plant_reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'seen']),
  ])

  const wo = { draft: 0, sent: 0, signed: 0, invoiced: 0, archived: 0 }
  for (const r of woRows ?? []) {
    const s = (r as { status: string }).status
    if (s in wo) wo[s as keyof typeof wo]++
  }

  const actionTotal =
    wo.draft + wo.sent + wo.signed + (openReports ?? 0)

  return {
    visitsToday: visitsToday ?? 0,
    visitsPlanned: visitsPlanned ?? 0,
    woDraft: wo.draft,
    woSent: wo.sent,
    woSigned: wo.signed,
    woInvoiced: wo.invoiced,
    woArchived: wo.archived,
    openReports: openReports ?? 0,
    actionTotal,
  }
}
