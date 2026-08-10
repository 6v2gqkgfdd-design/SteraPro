'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { importShopifyOrders } from '@/lib/shopify-orders-sync'

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')
  const { data: isStaff } = await supabase.rpc('is_staff')
  if (!isStaff) throw new Error('Geen toegang')
  return supabase
}

export async function importOrdersForCompany(companyId: string) {
  await requireStaff()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return { ok: false, message: 'Server-config ontbreekt' }
  }
  const admin = createServiceClient(url, key, { auth: { persistSession: false } })
  try {
    const result = await importShopifyOrders(admin, { limit: 100 })
    // Optioneel: als de klant-e-mail exact matcht, is company_id al gezet.
    // Toon in de melding hoeveel van déze klant.
    const { count } = await admin
      .from('shopify_orders')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)

    revalidatePath(`/companies/${companyId}`)
    revalidatePath(`/companies/${companyId}/bestellingen`)
    revalidatePath('/dashboard')
    return {
      ...result,
      message: `${result.message} · ${count ?? 0} bij deze klant`,
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Import mislukt',
      fetched: 0,
      upserted: 0,
      linked: 0,
    }
  }
}

export async function scheduleOrderDelivery(formData: FormData) {
  const supabase = await requireStaff()
  const orderId = String(formData.get('order_id') || '')
  const companyId = String(formData.get('company_id') || '')
  const whenLocal = String(formData.get('scheduled_start') || '')
  const locationId = String(formData.get('location_id') || '') || null
  const notes = String(formData.get('delivery_notes') || '').trim() || null

  if (!orderId || !whenLocal) {
    throw new Error('Bestelling en tijdstip zijn verplicht')
  }

  // datetime-local is Europe/Brussels wall time without zone — treat as Brussels
  // by appending offset approx: use Date and assume local server... Better:
  // interpret as Brussels via explicit parse.
  const scheduledStart = brusselsLocalToIso(whenLocal)
  const start = new Date(scheduledStart)
  const end = new Date(start.getTime() + 90 * 60 * 1000)

  const { error } = await supabase
    .from('shopify_orders')
    .update({
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      location_id: locationId,
      delivery_notes: notes,
      delivery_status: 'scheduled',
      company_id: companyId || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  if (error) throw new Error(error.message)

  revalidatePath(`/companies/${companyId}`)
  revalidatePath(`/companies/${companyId}/bestellingen`)
  revalidatePath('/dashboard')
}

export async function markOrderDelivered(formData: FormData) {
  const supabase = await requireStaff()
  const orderId = String(formData.get('order_id') || '')
  const companyId = String(formData.get('company_id') || '')

  const { error } = await supabase
    .from('shopify_orders')
    .update({
      delivery_status: 'delivered',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  if (error) throw new Error(error.message)
  revalidatePath(`/companies/${companyId}`)
  revalidatePath(`/companies/${companyId}/bestellingen`)
  revalidatePath('/dashboard')
}

export async function unscheduleOrder(formData: FormData) {
  const supabase = await requireStaff()
  const orderId = String(formData.get('order_id') || '')
  const companyId = String(formData.get('company_id') || '')

  const { error } = await supabase
    .from('shopify_orders')
    .update({
      delivery_status: 'unscheduled',
      scheduled_start: null,
      scheduled_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  if (error) throw new Error(error.message)
  revalidatePath(`/companies/${companyId}`)
  revalidatePath(`/companies/${companyId}/bestellingen`)
  revalidatePath('/dashboard')
}

/** datetime-local "YYYY-MM-DDTHH:mm" → ISO, treated as Europe/Brussels. */
function brusselsLocalToIso(local: string): string {
  // Use Intl to get Brussels offset for that civil time via iterative approach:
  // Append as if UTC then wrong — simpler: construct with explicit offset from formatter.
  const m = local.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  )
  if (!m) return new Date(local).toISOString()
  const [, y, mo, d, h, mi, s] = m
  // Guess CET/CEST: try both and pick the one that formats back to same local in Brussels
  for (const offset of ['+02:00', '+01:00']) {
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s || '00'}${offset}`
    const dt = new Date(iso)
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Brussels',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(dt)
    const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
    if (
      get('year') === y &&
      get('month') === mo &&
      get('day') === d &&
      get('hour') === h &&
      get('minute') === mi
    ) {
      return dt.toISOString()
    }
  }
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s || '00'}+02:00`).toISOString()
}
