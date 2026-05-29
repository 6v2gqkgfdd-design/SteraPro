/**
 * Bewerk een bestaande concept-offerte met dezelfde QuoteBuilder als
 * /quotes/new. Verschil: we laden de header en regels uit de DB en
 * geven `existingQuoteId` mee zodat de save-action UPDATE i.p.v.
 * INSERT doet.
 *
 * Enkel concept-offertes mogen geopend worden — voor andere statussen
 * sturen we de gebruiker terug naar de detailpagina (waar hij eerst
 * 'Heropen als concept' kan gebruiken).
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QuoteBuilder, {
  type LocationOption,
  type InitialLineInput,
} from '@/app/quotes/new/quote-builder'

export const dynamic = 'force-dynamic'

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/login')
  }

  const [
    { data: quote, error: quoteError },
    { data: lines, error: linesError },
    { data: locationsRaw, error: locationsError },
  ] = await Promise.all([
    supabase
      .from('quotes')
      .select(
        'id, status, location_id, company_id, customer_name, customer_email, intro_note, valid_until, margin_pct, source_visit_id, reference_number'
      )
      .eq('id', id)
      .single(),
    supabase
      .from('quote_lines')
      .select(
        'id, line_type, supplier, nieuwkoop_itemcode, name, description, spec, image_url, supplier_unit_price_cents, unit_price_cents, quantity, source_visit_plant_id'
      )
      .eq('quote_id', id)
      .order('position', { ascending: true }),
    supabase
      .from('locations')
      .select('id, name, company_id, companies(name)')
      .order('name'),
  ])

  if (quoteError || !quote) {
    redirect('/quotes')
  }
  if (quote.status !== 'draft') {
    // Alleen concept-offertes mogen bewerkt worden — anders eerst
    // heropen via de detailpagina.
    redirect(`/quotes/${id}`)
  }

  const locations: LocationOption[] = (locationsRaw ?? []).map(
    (row: {
      id: string
      name: string | null
      company_id: string | null
      companies: { name: string } | { name: string }[] | null
    }) => {
      const company = Array.isArray(row.companies)
        ? row.companies[0]
        : row.companies
      const label = company?.name
        ? `${company.name} — ${row.name ?? ''}`.trim()
        : row.name ?? ''
      return {
        id: row.id,
        companyId: row.company_id,
        label,
      }
    }
  )

  // In edit-modus tonen we alle bestaande regels als 'extra regels'
  // (slotId = null). De slot-prefill uit de oorspronkelijke
  // onderhoudsbeurt heffen we niet opnieuw aan — de tech bewerkt
  // gewoon de bestaande set.
  const initialLines: InitialLineInput[] = (lines ?? []).map((l) => ({
    slotId: null,
    lineType: l.line_type as InitialLineInput['lineType'],
    supplier: l.supplier as InitialLineInput['supplier'],
    itemcode: l.nieuwkoop_itemcode,
    name: l.name,
    description: l.description,
    spec: l.spec,
    imageUrl: l.image_url,
    supplierUnitPriceCents: l.supplier_unit_price_cents,
    unitPriceCents: l.unit_price_cents,
    quantity: l.quantity,
  }))

  if (locationsError) {
    // eslint-disable-next-line no-console
    console.error('[edit quote] locations fetch error', locationsError)
  }
  if (linesError) {
    // eslint-disable-next-line no-console
    console.error('[edit quote] lines fetch error', linesError)
  }

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-8 sm:pt-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <a
          href={`/quotes/${id}`}
          className="inline-block text-sm text-stera-ink-soft underline-offset-2 hover:text-stera-green hover:underline"
        >
          ← Terug naar offerte
        </a>

        <div>
          <p className="stera-eyebrow text-stera-green">Bewerken</p>
          <h1 className="text-2xl font-bold tracking-tight text-stera-ink">
            {quote.reference_number || 'Concept-offerte'}
          </h1>
          <p className="mt-1 text-sm text-stera-ink-soft">
            Pas regels aan of voeg er toe. Bij opslaan worden alle regels
            vervangen door de nieuwe set.
          </p>
        </div>

        <QuoteBuilder
          locations={locations}
          existingQuoteId={id}
          initialLines={initialLines}
          initialHeader={{
            locationId: quote.location_id ?? null,
            customerName: quote.customer_name ?? '',
            customerEmail: quote.customer_email ?? '',
            introNote: quote.intro_note ?? '',
            validUntil: quote.valid_until ?? null,
            marginPct: quote.margin_pct ?? null,
          }}
        />
      </div>
    </main>
  )
}
