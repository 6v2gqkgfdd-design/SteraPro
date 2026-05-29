'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const VALID_STATUSES = new Set([
  'draft',
  'sent',
  'accepted',
  'declined',
  'ordered',
  'expired',
  'cancelled',
])

// Server-actie aangeroepen vanuit een <form action={...}> op de
// offerte-detailpagina. Zet de status van de offerte en houdt
// goedgekeurd-/afgewezen-tijdstippen automatisch bij.
export async function updateQuoteStatusAction(formData: FormData) {
  const quoteId = String(formData.get('quote_id') || '')
  const status = String(formData.get('status') || '')

  if (!quoteId || !VALID_STATUSES.has(status)) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { status }
  if (status === 'accepted') {
    update.accepted_at = now
    update.declined_at = null
  } else if (status === 'declined') {
    update.declined_at = now
    update.accepted_at = null
  } else if (status === 'draft') {
    update.accepted_at = null
    update.declined_at = null
  }

  await supabase.from('quotes').update(update).eq('id', quoteId)
  revalidatePath(`/quotes/${quoteId}`)
  revalidatePath('/quotes')
}

// Volledige verwijdering — cascade zorgt dat quote_lines mee verdwijnen.
// Always-allowed maar wel met dubbele bevestiging in de UI. Na succes
// gaan we terug naar het offerte-overzicht.
export async function deleteQuoteAction(formData: FormData) {
  const quoteId = String(formData.get('quote_id') || '')
  const confirm = String(formData.get('confirm') || '')
  if (!quoteId) return
  if (confirm !== 'VERWIJDER') {
    // Veiligheidsnet — UI vraagt de bevestiging, mocht hij ontbreken
    // dan stoppen we hier zonder iets te wijzigen.
    return
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('quotes').delete().eq('id', quoteId)
  revalidatePath('/quotes')
  redirect('/quotes')
}
