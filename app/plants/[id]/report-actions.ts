'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const VALID_STATUSES = ['new', 'seen', 'handled'] as const
type Status = (typeof VALID_STATUSES)[number]

export async function updatePlantReportStatus(formData: FormData) {
  const reportId = String(formData.get('report_id') || '')
  const status = String(formData.get('status') || '') as Status
  const plantId = String(formData.get('plant_id') || '')

  if (!reportId || !VALID_STATUSES.includes(status)) return

  const supabase = await createClient()

  const update: Record<string, unknown> = { status }
  if (status === 'handled') {
    update.handled_at = new Date().toISOString()
  } else if (status === 'new') {
    update.handled_at = null
  }

  const { error } = await supabase
    .from('plant_reports')
    .update(update)
    .eq('id', reportId)

  if (error) {
    console.error('[plant_reports] update failed', error)
    return
  }

  if (plantId) revalidatePath(`/plants/${plantId}`)
  revalidatePath('/dashboard')
}

export async function deletePlantReport(formData: FormData) {
  const reportId = String(formData.get('report_id') || '')
  const plantId = String(formData.get('plant_id') || '')

  if (!reportId) return

  const supabase = await createClient()

  const { error } = await supabase
    .from('plant_reports')
    .delete()
    .eq('id', reportId)

  if (error) {
    console.error('[plant_reports] delete failed', error)
    return
  }

  if (plantId) revalidatePath(`/plants/${plantId}`)
  revalidatePath('/dashboard')
}
