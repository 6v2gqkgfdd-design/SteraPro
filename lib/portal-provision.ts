import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Account na de eerste bestelling of ondertekende offerte.
 * Staat uit tot PORTAL_AUTO_PROVISION=1. Zonder die vlag schrijft dit niets.
 */
export function portalAutoProvisionEnabled(): boolean {
  return process.env.PORTAL_AUTO_PROVISION === '1'
}

export async function maybeProvisionPortalAccess(
  supabase: SupabaseClient,
  input: { companyId: string | null; email: string | null; name?: string | null }
): Promise<'skipped' | 'created' | 'exists' | 'no-email'> {
  if (!portalAutoProvisionEnabled()) return 'skipped'
  const email = input.email?.trim().toLowerCase() || ''
  if (!input.companyId || !email) return 'no-email'

  const { data, error } = await supabase
    .from('portal_contacts')
    .select('id, email, company_id, status')
    .ilike('email', email)
    .limit(20)

  if (error) {
    console.error('[portal] provision lookup', error.code)
    return 'skipped'
  }

  const existing = (data || []).find((row) => String(row.email || '').toLowerCase() === email)
  if (existing) return 'exists'

  const { error: insertError } = await supabase.from('portal_contacts').insert({
    email,
    company_id: input.companyId,
    status: 'approved',
    name: input.name?.trim() || null,
  })
  if (insertError) {
    console.error('[portal] provision insert', insertError.code)
    return 'skipped'
  }
  return 'created'
}
