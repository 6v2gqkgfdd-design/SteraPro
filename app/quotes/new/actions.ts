'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type QuoteLineInput = {
  lineType: 'plant' | 'outer_pot' | 'custom' | 'combination' | 'transport'
  supplier: 'nieuwkoop' | 'stera' | null
  itemcode: string | null
  name: string
  description: string | null
  spec: string | null
  imageUrl: string | null
  supplierUnitPriceCents: number | null
  unitPriceCents: number
  quantity: number
}

type CreateQuoteInput = {
  locationId: string | null
  companyId: string | null
  customerName: string
  customerEmail: string
  introNote: string
  validUntil: string | null
  // Wordt opgeslagen in quotes.margin_pct als factor (bv. 2.5).
  marginPct: number | null
  sourceVisitId: string | null
  lines: QuoteLineInput[]
  // Indien ingevuld, updaten we een bestaande offerte i.p.v. een
  // nieuwe te insertten. De UI mag dit alleen meegeven als de quote
  // status 'draft' is.
  existingQuoteId?: string | null
}

type CreateQuoteResult =
  | { ok: true; quoteId: string; referenceNumber: string | null }
  | { ok: false; error: string }

export async function createQuote(
  input: CreateQuoteInput
): Promise<CreateQuoteResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return { ok: false, error: 'Je bent niet (meer) ingelogd.' }
  }

  const lines = input.lines.filter((l) => l.name.trim().length > 0)
  if (lines.length === 0) {
    return {
      ok: false,
      error: 'Voeg minstens één regel met een naam toe aan de offerte.',
    }
  }

  const subtotal = lines.reduce(
    (sum, l) =>
      sum + Math.round(l.unitPriceCents) * Math.max(1, l.quantity),
    0
  )

  // Bestaande offerte updaten: zelfde header bijwerken, oude regels
  // wissen, nieuwe inserten. Enkel toegestaan op draft-offertes om
  // verstuurde of goedgekeurde offertes niet ongemerkt te veranderen.
  if (input.existingQuoteId) {
    const { data: existing, error: existingError } = await supabase
      .from('quotes')
      .select('id, status, reference_number')
      .eq('id', input.existingQuoteId)
      .single()

    if (existingError || !existing) {
      return { ok: false, error: 'Offerte niet gevonden.' }
    }
    if (existing.status !== 'draft') {
      return {
        ok: false,
        error:
          'Enkel concept-offertes kunnen bewerkt worden. Heropen de offerte als concept om hem aan te passen.',
      }
    }

    const { error: updateError } = await supabase
      .from('quotes')
      .update({
        location_id: input.locationId,
        company_id: input.companyId,
        source_visit_id: input.sourceVisitId,
        customer_name: input.customerName.trim() || null,
        customer_email: input.customerEmail.trim() || null,
        intro_note: input.introNote.trim() || null,
        valid_until: input.validUntil || null,
        margin_pct: input.marginPct ?? null,
        subtotal_cents: subtotal,
      })
      .eq('id', existing.id)

    if (updateError) {
      return { ok: false, error: updateError.message }
    }

    // Bestaande regels weg, nieuwe set inserten.
    await supabase.from('quote_lines').delete().eq('quote_id', existing.id)

    const lineRows = lines.map((l, idx) =>
      buildLineRow(existing.id, l, idx)
    )
    const { error: linesError } = await supabase
      .from('quote_lines')
      .insert(lineRows)

    if (linesError) {
      return { ok: false, error: linesError.message }
    }

    revalidatePath('/quotes')
    revalidatePath(`/quotes/${existing.id}`)
    return {
      ok: true,
      quoteId: existing.id,
      referenceNumber: existing.reference_number ?? null,
    }
  }

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      location_id: input.locationId,
      company_id: input.companyId,
      source_visit_id: input.sourceVisitId,
      status: 'draft',
      customer_name: input.customerName.trim() || null,
      customer_email: input.customerEmail.trim() || null,
      intro_note: input.introNote.trim() || null,
      valid_until: input.validUntil || null,
      margin_pct: input.marginPct ?? null,
      subtotal_cents: subtotal,
    })
    .select('id, reference_number')
    .single()

  if (quoteError || !quote) {
    return {
      ok: false,
      error: quoteError?.message || 'Offerte kon niet aangemaakt worden.',
    }
  }

  const lineRows = lines.map((l, idx) => buildLineRow(quote.id, l, idx))

  const { error: linesError } = await supabase
    .from('quote_lines')
    .insert(lineRows)

  if (linesError) {
    // Rol de offerte terug zodat er geen lege offerte blijft staan.
    await supabase.from('quotes').delete().eq('id', quote.id)
    return { ok: false, error: linesError.message }
  }

  revalidatePath('/quotes')

  return {
    ok: true,
    quoteId: quote.id,
    referenceNumber: quote.reference_number ?? null,
  }
}

function buildLineRow(
  quoteId: string,
  l: QuoteLineInput,
  idx: number
) {
  const unit = Math.round(l.unitPriceCents)
  const qty = Math.max(1, l.quantity)
  return {
    quote_id: quoteId,
    line_type: l.lineType,
    position: idx,
    supplier: l.supplier,
    nieuwkoop_itemcode: l.itemcode,
    name: l.name.trim(),
    description: l.description?.trim() || null,
    spec: l.spec?.trim() || null,
    image_url: l.imageUrl || null,
    supplier_unit_price_cents: l.supplierUnitPriceCents,
    unit_price_cents: unit,
    quantity: qty,
    line_total_cents: unit * qty,
  }
}
