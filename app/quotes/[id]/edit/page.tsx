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
import { findPotSize } from '@/lib/pot-sizes'
import { formatRoomLabel } from '@/lib/rooms'
import QuoteBuilder, {
  type LocationOption,
  type InitialLineInput,
  type ReplacementSlot,
  type VisitPrefill,
} from '@/app/quotes/new/quote-builder'

export const dynamic = 'force-dynamic'

function one<T>(value: T[] | T | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

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

  // Indien de offerte uit een onderhoudsbeurt komt: laad de
  // vervangings-slots opnieuw zodat de tech terug per dode plant kan
  // wisselen van combinatie. Geen AI-analyse meer — die was alleen
  // nodig voor de eerste auto-suggest; nu hebben we al gekozen
  // combinaties.
  let visitPrefill: VisitPrefill | null = null
  if (quote.source_visit_id) {
    const { data: visit } = await supabase
      .from('maintenance_visits')
      .select(
        `id, location_id, company_id,
         companies ( id, name, contact_name, email ),
         locations ( id, name )`
      )
      .eq('id', quote.source_visit_id)
      .maybeSingle()

    if (visit) {
      const { data: flagged } = await supabase
        .from('maintenance_visit_plants')
        .select(
          `id, plant_id, photo_url,
           followup_replace, health_status,
           replacement_light_level, replacement_height_cm,
           replacement_pot_diameter_cm, replacement_is_hanging,
           replacement_care_level, replacement_needs_outer_pot,
           replacement_notes,
           plants ( nickname, species, pot_size_code, photo_url,
                    rooms ( id, name, floor ) )`
        )
        .eq('visit_id', quote.source_visit_id)
        .or(
          'followup_replace.eq.true,and(health_status.eq.dead,followup_replace.eq.false)'
        )

      // Foto-fallback: meest recente foto uit eerdere beurten als
      // huidige rij er geen heeft.
      const flaggedPlantIds = Array.from(
        new Set(
          (flagged ?? [])
            .map((r) => (r as { plant_id?: string | null }).plant_id)
            .filter((v): v is string => Boolean(v))
        )
      )
      const latestPhotoByPlant = new Map<string, string>()
      if (flaggedPlantIds.length > 0) {
        const { data: photoRows } = await supabase
          .from('maintenance_visit_plants')
          .select('plant_id, photo_url, created_at')
          .in('plant_id', flaggedPlantIds)
          .not('photo_url', 'is', null)
          .order('created_at', { ascending: false })
        for (const p of (photoRows ?? []) as Array<{
          plant_id: string
          photo_url: string
        }>) {
          if (!latestPhotoByPlant.has(p.plant_id)) {
            latestPhotoByPlant.set(p.plant_id, p.photo_url)
          }
        }
      }

      const company = one(visit.companies) as {
        id?: string
        contact_name?: string | null
        email?: string | null
      } | null

      const slots: ReplacementSlot[] = (flagged ?? []).map(
        (row: Record<string, unknown>) => {
          const plant = one(row.plants) as {
            nickname?: string | null
            species?: string | null
            pot_size_code?: string | null
            photo_url?: string | null
            rooms?: unknown
          } | null
          const room = one(plant?.rooms) as {
            id?: string | null
            name?: string | null
            floor?: string | null
          } | null
          const roomLabel = room?.name
            ? formatRoomLabel(room.name, room.floor ?? null)
            : null
          const plantId = (row.plant_id as string | null) ?? null
          const lightRaw = row.replacement_light_level
          const light =
            lightRaw === 'high' ||
            lightRaw === 'medium' ||
            lightRaw === 'low'
              ? lightRaw
              : null
          const careRaw = row.replacement_care_level
          const careLevel =
            careRaw === 'easy' || careRaw === 'hard' ? careRaw : null
          const potSize = findPotSize(plant?.pot_size_code ?? null)
          const currentPotLabel = potSize
            ? potSize.minDiameter === potSize.maxDiameter
              ? `Ø ${potSize.minDiameter} cm`
              : `Ø ${potSize.minDiameter}–${potSize.maxDiameter} cm`
            : null
          const currentPotDiameterCm = potSize
            ? Math.round((potSize.minDiameter + potSize.maxDiameter) / 2)
            : null
          const cascadedPhoto =
            (row.photo_url as string | null) ??
            (plantId
              ? latestPhotoByPlant.get(plantId) ?? null
              : null) ??
            plant?.photo_url ??
            null
          const wantsReplacement = Boolean(row.followup_replace)
          return {
            visitPlantId: row.id as string,
            photoUrl: cascadedPhoto,
            currentPotLabel,
            currentPotDiameterCm,
            roomId: (room?.id as string | null) ?? null,
            roomLabel,
            wantsReplacement,
            oldPlantName: plant?.nickname || plant?.species || 'Plant',
            oldPlantSpecies: plant?.species ?? null,
            light,
            heightCm:
              typeof row.replacement_height_cm === 'number'
                ? row.replacement_height_cm
                : null,
            potDiameterCm:
              typeof row.replacement_pot_diameter_cm === 'number'
                ? row.replacement_pot_diameter_cm
                : null,
            isHanging: Boolean(row.replacement_is_hanging),
            careLevel,
            needsOuterPot: row.replacement_needs_outer_pot !== false,
            notes: (row.replacement_notes as string | null) ?? null,
          }
        }
      )

      const visitLocation = one(visit.locations) as { id?: string } | null
      visitPrefill = {
        visitId: visit.id as string,
        companyId: company?.id ?? null,
        locationId: (visitLocation?.id as string | null) ?? null,
        customerName: company?.contact_name ?? '',
        customerEmail: company?.email ?? '',
        slots,
      }
    }
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

  // Regels met source_visit_plant_id koppelen aan hun slot, zodat ze
  // in de bouwer netjes onder de juiste dode plant verschijnen. Regels
  // zonder slot-koppeling worden 'extra regels' onderaan.
  const slotIdSet = new Set(
    (visitPrefill?.slots ?? []).map((s) => s.visitPlantId)
  )
  const initialLines: InitialLineInput[] = (lines ?? []).map((l) => ({
    slotId:
      l.source_visit_plant_id && slotIdSet.has(l.source_visit_plant_id)
        ? l.source_visit_plant_id
        : null,
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
          visitPrefill={visitPrefill}
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
