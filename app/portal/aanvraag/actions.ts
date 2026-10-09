'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { hasDemoPortalSession, saveDemoRequest } from '@/lib/portal-demo'

type Result = { ok: true } | { ok: false; error: string }

export async function createPlantRequest(input: {
  species: string
  quantity: string
  locationNote: string
  message: string
}): Promise<Result> {
  const message = input.message.trim()
  if (message.length < 3) {
    return { ok: false, error: 'Schrijf een korte toelichting (minstens 3 tekens).' }
  }

  if (await hasDemoPortalSession()) {
    await saveDemoRequest({
      id: crypto.randomUUID(),
      species: input.species.trim().slice(0, 300) || null,
      quantity: input.quantity.trim().slice(0, 80) || null,
      location_note: input.locationNote.trim().slice(0, 300) || null,
      message: message.slice(0, 2000),
      status: 'nieuw',
      created_at: new Date().toISOString(),
    })
    revalidatePath('/portal/aanvraag')
    return { ok: true }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Log eerst in.' }

  const { error } = await supabase.rpc('portal_create_plant_request', {
    _species: input.species.trim().slice(0, 300),
    _quantity: input.quantity.trim().slice(0, 80),
    _location_note: input.locationNote.trim().slice(0, 300),
    _message: message.slice(0, 2000),
  })

  if (error) {
    if (error.code === 'PGRST202' || /schema cache/i.test(error.message)) {
      return { ok: false, error: 'Aanvragen zijn op deze omgeving nog niet geactiveerd.' }
    }
    if (/message too short/i.test(error.message)) {
      return { ok: false, error: 'Schrijf een korte toelichting (minstens 3 tekens).' }
    }
    return { ok: false, error: 'Aanvraag opslaan mislukt. Probeer later opnieuw.' }
  }

  revalidatePath('/portal/aanvraag')
  revalidatePath('/portal-aanvragen')
  return { ok: true }
}
