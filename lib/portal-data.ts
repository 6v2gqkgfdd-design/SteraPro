import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { plantStatusLabel } from '@/lib/company-labels'
import { hasDemoPortalSession, demoPortalSnapshot } from '@/lib/portal-demo'
import { mspStore } from '@/lib/msp-request'

export type PortalCompany = {
  company_id: string
  company_name: string | null
  has_maintenance_contract: boolean
  city: string | null
  location_count: number
  plant_count: number
}

export type PortalPlant = {
  id: string
  nickname: string | null
  species: string | null
  status: string | null
  photo_url: string | null
  is_artificial: boolean | null
  is_dying: boolean | null
  is_dead: boolean | null
  needs_replacement: boolean | null
  installed_at: string | null
  location_name: string | null
  room_name: string | null
  room_floor: string | null
  care_tips?: string | null
  customer_note?: string | null
  qr_slug?: string | null
  common_name?: string | null
}

export type PortalVisit = {
  id: string
  title: string | null
  status: string
  scheduled_start: string | null
  scheduled_end: string | null
  ended_at: string | null
  performed_by: string | null
  general_notes: string | null
  location_name: string | null
}

export type PortalWorkOrder = {
  id: string
  status: string
  reference_number: string | null
  created_at: string | null
  signed_at: string | null
  invoiced_at: string | null
  invoice_reference: string | null
  visit_title: string | null
  scheduled_start: string | null
  performed_by: string | null
  location_name: string | null
  visit_id?: string | null
}

export type PortalQuoteLine = {
  name: string
  description: string | null
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  customer_decision: string | null
}

export type PortalQuote = {
  id: string
  reference_number: string | null
  title: string | null
  status: string
  intro_note: string | null
  valid_until: string | null
  subtotal_cents: number
  created_at: string | null
  location_name: string | null
  signing_token: string | null
  lines: PortalQuoteLine[]
}

export type PortalOrderLine = {
  title: string
  quantity: number
  variant_title: string | null
}

export type PortalOrder = {
  id: string
  name: string | null
  shopify_order_number: string | null
  financial_status: string | null
  fulfillment_status: string | null
  total_price_cents: number | null
  currency: string | null
  ordered_at: string | null
  delivery_status: string
  scheduled_start: string | null
  location_name: string | null
  line_items: PortalOrderLine[]
}

export type PortalRequestRow = {
  id: string
  species: string | null
  quantity: string | null
  location_note: string | null
  message: string
  status: string
  created_at: string
}

type Tag = { tag: 'ok' | 'plan' | 'let' | 'alarm' | 'neutraal'; text: string }

function missingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === 'PGRST202' ||
    /could not find the function/i.test(error.message || '') ||
    /schema cache/i.test(error.message || '')
  )
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

export function asCount(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(n) ? n : 0
}

async function requirePortal() {
  if (mspStore().demo || (await hasDemoPortalSession())) {
    return {
      demo: true as const,
      supabase: null,
      companyName: 'Demo Kantoor',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const { data } = await supabase.rpc('my_portal_company')
  const row = (Array.isArray(data) ? data[0] : null) as {
    status?: string
    company_id?: string | null
    company_name?: string | null
  } | null
  if (row?.status !== 'approved' || !row.company_id) redirect('/portal')

  return {
    demo: false as const,
    supabase,
    companyName: row.company_name || 'Mijn bedrijf',
  }
}

async function rpcList<T>(name: string): Promise<{ rows: T[]; schemaReady: boolean; companyName: string; demo: boolean }> {
  const ctx = await requirePortal()
  if (ctx.demo) {
    const snap = await demoPortalSnapshot()
    const rows =
      name === 'portal_my_plants'
        ? snap.plants
        : name === 'portal_my_visits'
          ? snap.visits
          : name === 'portal_my_work_orders'
            ? snap.workOrders
            : name === 'portal_my_quotes'
              ? snap.quotes
              : name === 'portal_my_orders'
                ? snap.orders
                : name === 'portal_my_requests'
                  ? snap.requests
                  : name === 'portal_my_company'
                    ? [snap.company]
                    : []
    return { rows: rows as T[], schemaReady: true, companyName: ctx.companyName, demo: true }
  }
  const { supabase, companyName } = ctx
  const { data, error } = await supabase.rpc(name)
  if (error) {
    if (!missingRpc(error)) console.error(`[portal] ${name}`, error.code)
    return { rows: [], schemaReady: !missingRpc(error), companyName, demo: false }
  }
  return {
    rows: (Array.isArray(data) ? data : []) as T[],
    schemaReady: true,
    companyName,
    demo: false,
  }
}

export async function loadPortalCompany() {
  const result = await rpcList<PortalCompany>('portal_my_company')
  const row = result.rows[0]
  return {
    companyName: result.companyName,
    schemaReady: result.schemaReady,
    demo: result.demo,
    company: row
      ? {
          ...row,
          location_count: asCount(row.location_count),
          plant_count: asCount(row.plant_count),
          has_maintenance_contract: Boolean(row.has_maintenance_contract),
        }
      : null,
  }
}

export async function loadPortalPlants() {
  return rpcList<PortalPlant>('portal_my_plants')
}

export async function loadPortalVisits() {
  return rpcList<PortalVisit>('portal_my_visits')
}

export async function loadPortalWorkOrders() {
  return rpcList<PortalWorkOrder>('portal_my_work_orders')
}

export async function loadPortalQuotes() {
  const result = await rpcList<PortalQuote>('portal_my_quotes')
  return {
    ...result,
    rows: result.rows.map((quote) => ({
      ...quote,
      lines: asArray<PortalQuoteLine>(quote.lines),
      subtotal_cents: asCount(quote.subtotal_cents),
    })),
  }
}

export async function loadPortalOrders() {
  const result = await rpcList<PortalOrder>('portal_my_orders')
  return {
    ...result,
    rows: result.rows.map((order) => ({
      ...order,
      line_items: asArray<PortalOrderLine>(order.line_items),
      total_price_cents:
        order.total_price_cents == null ? null : asCount(order.total_price_cents),
    })),
  }
}

export async function loadPortalRequests() {
  return rpcList<PortalRequestRow>('portal_my_requests')
}

export function plantLabel(plant: PortalPlant): string {
  return plant.common_name || plant.nickname || plant.species || 'Plant'
}

export function plantPlace(plant: PortalPlant): string {
  return plant.room_name || plant.location_name || '—'
}

export function plantTag(plant: PortalPlant): Tag {
  if (plant.is_dead || plant.status === 'dead') return { tag: 'neutraal', text: 'Verwijderd' }
  if (plant.needs_replacement || plant.status === 'replacement_needed') {
    return { tag: 'alarm', text: 'Vervangen nodig' }
  }
  if (plant.is_dying || plant.status === 'needs_attention' || plant.status === 'maintenance_due') {
    return { tag: 'let', text: 'Opvolgen' }
  }
  if (plant.status === 'healthy') return { tag: 'ok', text: 'Gezond' }
  return { tag: 'plan', text: plantStatusLabel(plant.status) }
}

export function visitTag(status: string): Tag {
  if (status === 'completed') return { tag: 'ok', text: 'Afgewerkt' }
  if (status === 'cancelled') return { tag: 'neutraal', text: 'Geannuleerd' }
  if (status === 'in_progress' || status === 'paused') return { tag: 'plan', text: 'Bezig' }
  return { tag: 'plan', text: 'Ingepland' }
}

export function reportStatusLabel(status: string): string {
  if (status === 'handled') return 'Opgelost'
  if (status === 'seen') return 'In behandeling'
  return 'Ontvangen'
}

export function quoteTag(status: string): Tag {
  if (status === 'sent') return { tag: 'let', text: 'Te beoordelen' }
  if (status === 'accepted' || status === 'ordered') return { tag: 'ok', text: 'Goedgekeurd' }
  if (status === 'declined') return { tag: 'neutraal', text: 'Afgewezen' }
  if (status === 'expired') return { tag: 'neutraal', text: 'Verlopen' }
  return { tag: 'neutraal', text: status }
}

export function workOrderTag(status: string): Tag {
  if (status === 'invoiced' || status === 'archived') return { tag: 'ok', text: status === 'invoiced' ? 'Gefactureerd' : 'Afgerond' }
  if (status === 'signed') return { tag: 'ok', text: 'Goedgekeurd' }
  if (status === 'sent') return { tag: 'let', text: 'Te tekenen' }
  return { tag: 'plan', text: status }
}

export function orderTag(order: PortalOrder): Tag {
  if (order.fulfillment_status === 'fulfilled') return { tag: 'ok', text: 'Geleverd' }
  if (order.fulfillment_status === 'partial') return { tag: 'plan', text: 'Deels geleverd' }
  if (order.financial_status === 'refunded' || order.financial_status === 'voided') {
    return { tag: 'neutraal', text: 'Terugbetaald' }
  }
  if (order.financial_status === 'paid') return { tag: 'ok', text: 'Betaald' }
  if (order.financial_status === 'pending') return { tag: 'let', text: 'Open' }
  return { tag: 'plan', text: order.financial_status || 'Besteld' }
}

export function deliveryTag(status: string): Tag {
  if (status === 'delivered') return { tag: 'ok', text: 'Geleverd' }
  if (status === 'cancelled') return { tag: 'neutraal', text: 'Geannuleerd' }
  if (status === 'in_progress') return { tag: 'plan', text: 'Onderweg' }
  if (status === 'scheduled') return { tag: 'plan', text: 'Ingepland' }
  return { tag: 'plan', text: 'Nog in te plannen' }
}

export function requestStatusLabel(status: string): string {
  switch (status) {
    case 'nieuw':
      return 'Nieuw'
    case 'in_behandeling':
      return 'In behandeling'
    case 'afgehandeld':
      return 'Afgehandeld'
    case 'geannuleerd':
      return 'Geannuleerd'
    default:
      return status
  }
}

export function upcomingVisits(visits: PortalVisit[]): PortalVisit[] {
  return visits
    .filter((visit) => ['scheduled', 'in_progress', 'paused'].includes(visit.status))
    .sort((a, b) => dateValue(a.scheduled_start) - dateValue(b.scheduled_start))
}

export function recentVisits(visits: PortalVisit[]): PortalVisit[] {
  return visits
    .filter((visit) => visit.status === 'completed')
    .sort(
      (a, b) =>
        timeOrZero(b.ended_at || b.scheduled_start) - timeOrZero(a.ended_at || a.scheduled_start)
    )
}

export function attentionPlants(plants: PortalPlant[]): PortalPlant[] {
  return plants.filter((plant) => plantTag(plant).tag === 'let' || plantTag(plant).tag === 'alarm')
}

function dateValue(value: string | null | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER
}

function timeOrZero(value: string | null | undefined): number {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

export async function loadDashboard() {
  const ctx = await requirePortal()
  if (ctx.demo) {
    const snap = await demoPortalSnapshot()
    return {
      companyName: ctx.companyName,
      schemaReady: true,
      demo: true,
      company: snap.company,
      plants: snap.plants,
      visits: snap.visits,
      quotes: snap.quotes,
      reports: snap.reports,
    }
  }
  const { supabase, companyName } = ctx
  const [companyRes, plantsRes, visitsRes, quotesRes] = await Promise.all([
    supabase.rpc('portal_my_company'),
    supabase.rpc('portal_my_plants'),
    supabase.rpc('portal_my_visits'),
    supabase.rpc('portal_my_quotes'),
  ])
  const missing = [companyRes, plantsRes, visitsRes, quotesRes].some((res) => missingRpc(res.error))
  for (const res of [companyRes, plantsRes, visitsRes, quotesRes]) {
    if (res.error && !missingRpc(res.error)) console.error('[portal] dashboard', res.error.code)
  }
  const companyRow = (Array.isArray(companyRes.data) ? companyRes.data[0] : null) as PortalCompany | null
  return {
    companyName,
    schemaReady: !missing,
    demo: false,
    reports: [] as Awaited<ReturnType<typeof demoPortalSnapshot>>['reports'],
    company: companyRow
      ? {
          ...companyRow,
          location_count: asCount(companyRow.location_count),
          plant_count: asCount(companyRow.plant_count),
          has_maintenance_contract: Boolean(companyRow.has_maintenance_contract),
        }
      : null,
    plants: (Array.isArray(plantsRes.data) ? plantsRes.data : []) as PortalPlant[],
    visits: (Array.isArray(visitsRes.data) ? visitsRes.data : []) as PortalVisit[],
    quotes: ((Array.isArray(quotesRes.data) ? quotesRes.data : []) as PortalQuote[]).map((quote) => ({
      ...quote,
      lines: asArray<PortalQuoteLine>(quote.lines),
      subtotal_cents: asCount(quote.subtotal_cents),
    })),
  }
}

export async function loadMaintenance() {
  const ctx = await requirePortal()
  if (ctx.demo) {
    const snap = await demoPortalSnapshot()
    return {
      companyName: ctx.companyName,
      schemaReady: true,
      demo: true,
      visits: snap.visits,
      workOrders: snap.workOrders,
      reports: snap.reports,
    }
  }
  const { supabase, companyName } = ctx
  const [visitsRes, ordersRes] = await Promise.all([
    supabase.rpc('portal_my_visits'),
    supabase.rpc('portal_my_work_orders'),
  ])
  const missing = [visitsRes, ordersRes].some((res) => missingRpc(res.error))
  return {
    companyName,
    schemaReady: !missing,
    demo: false,
    visits: (Array.isArray(visitsRes.data) ? visitsRes.data : []) as PortalVisit[],
    workOrders: (Array.isArray(ordersRes.data) ? ordersRes.data : []) as PortalWorkOrder[],
    reports: [] as Awaited<ReturnType<typeof demoPortalSnapshot>>['reports'],
  }
}

export async function loadContract() {
  const ctx = await requirePortal()
  if (ctx.demo) {
    const snap = await demoPortalSnapshot()
    return {
      companyName: ctx.companyName,
      schemaReady: true,
      demo: true,
      company: snap.company,
      visits: snap.visits,
      sample: snap.contract,
    }
  }
  const { supabase, companyName } = ctx
  const [companyRes, visitsRes] = await Promise.all([
    supabase.rpc('portal_my_company'),
    supabase.rpc('portal_my_visits'),
  ])
  const companyRow = (Array.isArray(companyRes.data) ? companyRes.data[0] : null) as PortalCompany | null
  return {
    companyName,
    schemaReady: !missingRpc(companyRes.error) && !missingRpc(visitsRes.error),
    demo: false,
    sample: null as null | { term: string; frequency: string; price: string; note: string },
    company: companyRow
      ? {
          ...companyRow,
          location_count: asCount(companyRow.location_count),
          plant_count: asCount(companyRow.plant_count),
          has_maintenance_contract: Boolean(companyRow.has_maintenance_contract),
        }
      : null,
    visits: (Array.isArray(visitsRes.data) ? visitsRes.data : []) as PortalVisit[],
  }
}

export function orderItemSummary(order: PortalOrder): string {
  const lines = order.line_items || []
  if (lines.length === 0) return '—'
  const count = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
  const first = lines[0]?.title || 'product'
  if (lines.length === 1) return `${count || 1} × ${first}`
  return `${lines.length} producten`
}
