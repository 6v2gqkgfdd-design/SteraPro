import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QuoteBuilder, {
  type LocationOption,
  type VisitPrefill,
  type ReplacementSlot,
} from './quote-builder'

export const metadata = {
  title: 'Nieuwe offerte',
}

function one<T>(value: T[] | T | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams?: Promise<{ visit?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect('/login')
  }

  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, company_id, companies ( id, name )')
    .order('name')

  const locationOptions: LocationOption[] = (locations ?? []).map(
    (l: {
      id: string
      name: string | null
      company_id: string | null
      companies:
        | { id: string; name: string | null }[]
        | { id: string; name: string | null }
        | null
    }) => {
      const c = Array.isArray(l.companies) ? l.companies[0] : l.companies
      return {
        id: l.id,
        companyId: c?.id ?? l.company_id ?? null,
        label:
          [c?.name, l.name].filter(Boolean).join(' — ') ||
          l.name ||
          'Locatie',
      }
    }
  )

  // Optionele prefill vanuit een onderhoudsbeurt (?visit=<id>).
  let visitPrefill: VisitPrefill | null = null
  const params = searchParams ? await searchParams : {}
  const visitId = params?.visit

  if (visitId) {
    const { data: visit } = await supabase
      .from('maintenance_visits')
      .select(
        `
        id, location_id, company_id,
        companies ( id, name, contact_name, email ),
        locations ( id, name )
      `
      )
      .eq('id', visitId)
      .maybeSingle()

    if (visit) {
      const { data: flagged } = await supabase
        .from('maintenance_visit_plants')
        .select(
          `
          id,
          replacement_light_level, replacement_height_cm,
          replacement_pot_diameter_cm, replacement_is_hanging,
          replacement_care_level, replacement_needs_outer_pot,
          replacement_notes,
          plants ( nickname, species )
        `
        )
        .eq('visit_id', visitId)
        .or('followup_replace.eq.true,health_status.eq.dead')

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
          } | null
          const lightRaw = row.replacement_light_level
          const light =
            lightRaw === 'high' || lightRaw === 'medium' || lightRaw === 'low'
              ? lightRaw
              : null
          const careRaw = row.replacement_care_level
          const careLevel =
            careRaw === 'easy' || careRaw === 'hard' ? careRaw : null
          return {
            visitPlantId: row.id as string,
            oldPlantName:
              plant?.nickname || plant?.species || 'Plant',
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

      visitPrefill = {
        visitId: visit.id,
        companyId: company?.id ?? visit.company_id ?? null,
        locationId: visit.location_id ?? null,
        customerName: company?.contact_name ?? '',
        customerEmail: company?.email ?? '',
        slots,
      }
    }
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="stera-eyebrow mb-2">Nieuwe offerte</p>
          <h1 className="text-3xl font-bold tracking-tight text-stera-ink">
            {visitPrefill ? 'Vervangingsofferte opstellen' : 'Offerte opstellen'}
          </h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            {visitPrefill
              ? 'Kies per te vervangen plant een nieuwe hydrocultuur-plant en een passende buitenpot. De condities uit het onderhoud sturen het voorstel.'
              : 'Kies de klant, voeg een hydrocultuur-plant en een buitenpot toe uit de Nieuwkoop-catalogus, en bewaar de offerte.'}
          </p>
        </div>
        <QuoteBuilder
          locations={locationOptions}
          visitPrefill={visitPrefill}
        />
      </div>
    </main>
  )
}
