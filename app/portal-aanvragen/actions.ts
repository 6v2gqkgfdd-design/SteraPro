'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { findShopifyCustomerIdByEmail } from '@/lib/shopify-admin'

type Result =
  | { ok: true; shopify: 'linked' | 'unchanged' | 'not_found' }
  | { ok: false; error: string }

/**
 * Keurt een portaal-aanvraag goed: koppelt aan een bestaand bedrijf, of
 * maakt een nieuw bedrijf uit de aanvraaggegevens en koppelt dat.
 */
export async function approvePortalRequest(
  contactId: string,
  companyChoice: string // company-id of 'new'
): Promise<Result> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Niet ingelogd.' }

  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) return { ok: false, error: 'Geen toegang.' }

  const { data: contact } = await supabase
    .from('portal_contacts')
    .select('id, email, request_data')
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return { ok: false, error: 'Aanvraag niet gevonden.' }

  let companyId = companyChoice
  if (companyChoice === 'new') {
    const d = (contact.request_data ?? {}) as Record<string, string>
    const { data: comp, error } = await supabase
      .from('companies')
      .insert({
        name: d.company_name || 'Nieuw bedrijf',
        contact_name:
          [d.first_name, d.last_name].filter(Boolean).join(' ') || null,
        email: (contact.email as string) || null,
        phone: d.phone || null,
        vat_number: d.vat_number || null,
        street: d.street || null,
        house_number: d.house_number || null,
        postal_code: d.postal_code || null,
        city: d.city || null,
        country: d.country || null,
        billing_email: d.billing_email || null,
      })
      .select('id')
      .single()
    if (error || !comp) {
      return { ok: false, error: error?.message || 'Bedrijf aanmaken mislukt.' }
    }
    companyId = comp.id as string
  }

  const { error } = await supabase
    .from('portal_contacts')
    .update({ company_id: companyId, status: 'approved' })
    .eq('id', contactId)
  if (error) return { ok: false, error: error.message }

  const shopify = await linkShopifyCustomer(supabase, companyId, contact.email as string)

  revalidatePath('/portal-aanvragen')
  return { ok: true, shopify }
}

/**
 * Vult companies.shopify_customer_id als die nog leeg is.
 * Alleen een Shopify-read (customers query). Een mislukte lookup
 * blokkeert de goedkeuring niet.
 */
async function linkShopifyCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  email: string
): Promise<'linked' | 'unchanged' | 'not_found'> {
  const { data: company } = await supabase
    .from('companies')
    .select('id, shopify_customer_id')
    .eq('id', companyId)
    .maybeSingle()
  if (!company) return 'not_found'
  if (company.shopify_customer_id) return 'unchanged'

  const shopifyId = await findShopifyCustomerIdByEmail(email)
  if (!shopifyId) return 'not_found'

  const { error } = await supabase
    .from('companies')
    .update({ shopify_customer_id: shopifyId })
    .eq('id', companyId)
    .is('shopify_customer_id', null)
  return error ? 'not_found' : 'linked'
}
