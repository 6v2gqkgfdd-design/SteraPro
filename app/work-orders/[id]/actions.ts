'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function markAsSent(formData: FormData) {
  const id = String(formData.get('id') || '')
  const email = String(formData.get('email') || '')
  if (!id) return

  const supabase = await createClient()
  const { error } = await supabase
    .from('work_orders')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_to_email: email.trim() || null,
      sent_method: 'manual',
    })
    .eq('id', id)

  if (error) console.error('[work_orders] mark sent failed', error)

  revalidatePath('/work-orders')
  revalidatePath(`/work-orders/${id}`)
}

export async function reopenWorkOrder(formData: FormData) {
  const id = String(formData.get('id') || '')
  if (!id) return

  const supabase = await createClient()
  const { error } = await supabase
    .from('work_orders')
    .update({
      status: 'draft',
      sent_at: null,
      sent_to_email: null,
      sent_method: null,
    })
    .eq('id', id)
    .neq('status', 'signed') // niet heropenen als al getekend

  if (error) console.error('[work_orders] reopen failed', error)

  revalidatePath('/work-orders')
  revalidatePath(`/work-orders/${id}`)
}

// Verwijder een werkbon ongeacht zijn status (ook getekend).
// Bedoeld voor beheerder: bv. werkbon was per ongeluk aangemaakt of
// klant wil hem ongedaan maken. Na verwijderen blijft de
// onderhoudsbeurt zelf gewoon bestaan en kan er evt. een nieuwe
// werkbon van gemaakt worden.
export async function deleteWorkOrder(formData: FormData) {
  const id = String(formData.get('id') || '')
  const visitId = String(formData.get('visit_id') || '')
  if (!id) return

  const supabase = await createClient()
  const { error } = await supabase.from('work_orders').delete().eq('id', id)

  if (error) {
    console.error('[work_orders] delete failed', error)
    return
  }

  revalidatePath('/work-orders')
  if (visitId) {
    revalidatePath(`/maintenance/${visitId}`)
    redirect(`/maintenance/${visitId}`)
  } else {
    redirect('/work-orders')
  }
}

export async function markAsSignedManually(formData: FormData) {
  const id = String(formData.get('id') || '')
  const name = String(formData.get('name') || '').trim()
  if (!id || !name) return

  const supabase = await createClient()
  const { error } = await supabase
    .from('work_orders')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_name: name,
    })
    .eq('id', id)

  if (error) console.error('[work_orders] manual sign failed', error)

  revalidatePath('/work-orders')
  revalidatePath(`/work-orders/${id}`)
}
