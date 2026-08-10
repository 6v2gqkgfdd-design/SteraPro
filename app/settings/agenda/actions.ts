'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { normalizeIcsUrl, syncIcsIntoVisits } from '@/lib/calendar'
import { randomBytes } from 'crypto'

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

export async function saveImportUrl(formData: FormData) {
  const supabase = await requireStaff()
  const raw = String(formData.get('import_ics_url') || '').trim()
  const url = raw ? normalizeIcsUrl(raw) : null

  const { error } = await supabase
    .from('calendar_sync_settings')
    .upsert(
      {
        id: 1,
        import_ics_url: url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

  if (error) throw new Error(error.message)
  revalidatePath('/settings/agenda')
  revalidatePath('/dashboard')
}

export async function rotateFeedToken() {
  const supabase = await requireStaff()
  const token = randomBytes(24).toString('hex')

  const { error } = await supabase
    .from('calendar_sync_settings')
    .upsert(
      {
        id: 1,
        feed_token: token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

  if (error) throw new Error(error.message)
  revalidatePath('/settings/agenda')
}

export async function runCalendarSyncNow(): Promise<{ ok: boolean; message: string }> {
  await requireStaff()

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPA_URL || !SUPA_KEY) {
    return { ok: false, message: 'Server env ontbreekt (service role)' }
  }

  const admin = createServiceClient(SUPA_URL, SUPA_KEY, {
    auth: { persistSession: false },
  })

  const { data: settings } = await admin
    .from('calendar_sync_settings')
    .select('import_ics_url')
    .eq('id', 1)
    .maybeSingle()

  if (!settings?.import_ics_url) {
    return { ok: false, message: 'Sla eerst een iCloud ICS-URL op' }
  }

  const result = await syncIcsIntoVisits(admin, settings.import_ics_url)

  await admin
    .from('calendar_sync_settings')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_ok: result.ok,
      last_sync_message: result.message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  revalidatePath('/settings/agenda')
  revalidatePath('/dashboard')
  revalidatePath('/maintenance')
  return { ok: result.ok, message: result.message }
}
