'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SubmitDecisionInput = {
  token: string
  name: string
  email: string
  signature: string
  decisions: Array<{
    id: string
    decision: 'accepted' | 'declined'
    comment: string
  }>
}

export type SubmitDecisionResult =
  | {
      ok: true
      status: 'accepted' | 'declined'
      accepted_count: number
      declined_count: number
    }
  | { ok: false; error: string }

export async function submitQuoteDecision(
  input: SubmitDecisionInput
): Promise<SubmitDecisionResult> {
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

  const { data, error } = await supabase.rpc('submit_quote_decision', {
    _token: input.token,
    _name: input.name.trim(),
    _email: input.email.trim(),
    _signature: input.signature,
    _decisions: input.decisions,
  })

  if (error) {
    console.error('[submit_quote_decision] failed', error)
    return {
      ok: false,
      error:
        error.message?.includes('reeds beantwoord') ||
        error.message?.includes('niet gevonden')
          ? 'Deze offerte werd reeds beantwoord of is niet langer beschikbaar.'
          : 'Goedkeuring mislukt. Probeer het later opnieuw.',
    }
  }

  revalidatePath(`/q/${input.token}`)

  const payload = data as unknown as {
    ok: boolean
    status: 'accepted' | 'declined'
    accepted_count: number
    declined_count: number
  } | null

  return {
    ok: true,
    status: payload?.status ?? 'accepted',
    accepted_count: Number(payload?.accepted_count ?? 0),
    declined_count: Number(payload?.declined_count ?? 0),
  }
}
