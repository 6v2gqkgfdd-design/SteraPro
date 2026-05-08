'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SignResult =
  | { ok: true }
  | { ok: false; error: string }

export async function signWorkOrder(input: {
  token: string
  name: string
  email: string
  signature: string
}): Promise<SignResult> {
  if (!input.token) {
    return { ok: false, error: 'Geen geldige link.' }
  }
  if (!input.name.trim()) {
    return { ok: false, error: 'Vul je naam in.' }
  }
  if (!input.signature || input.signature.length < 100) {
    return {
      ok: false,
      error: 'Plaats eerst je handtekening in het kader.',
    }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('sign_work_order', {
    _token: input.token,
    _name: input.name.trim(),
    _email: input.email.trim(),
    _signature: input.signature,
  })

  if (error) {
    console.error('[sign_work_order] failed', error)
    return {
      ok: false,
      error:
        error.message?.includes('al getekend') ||
        error.message?.includes('niet gevonden')
          ? 'Deze werkbon is al getekend of niet langer beschikbaar.'
          : 'Ondertekenen mislukt. Probeer het later opnieuw.',
    }
  }

  revalidatePath(`/sign/${input.token}`)
  return { ok: true }
}
