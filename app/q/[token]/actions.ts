'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { maybeProvisionPortalAccess, portalAutoProvisionEnabled } from '@/lib/portal-provision'

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

  if (portalAutoProvisionEnabled()) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      const admin = createServiceClient(url, key, { auth: { persistSession: false } })
      const { data: quote } = await admin
        .from('quotes')
        .select('company_id, status')
        .eq('signing_token', input.token)
        .maybeSingle()
      if (quote?.status === 'accepted' && quote.company_id) {
        await maybeProvisionPortalAccess(admin, {
          companyId: quote.company_id,
          email: input.email,
          name: input.name,
        })
      }
    }
  }

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
