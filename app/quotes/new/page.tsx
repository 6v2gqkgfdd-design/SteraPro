import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { findPotSize } from '@/lib/pot-sizes'
import QuoteBuilder, {
  type LocationOption,
  type VisitPrefill,
  type ReplacementSlot,
  type InitialLineInput,
} from './quote-builder'

const LIGHT_TO_CATALOG_MAP: Record<'high' | 'medium' | 'low', string> = {
  high: 'zon',
  medium: 'half-schaduw',
  low: 'schaduw',
}

type Candidate = {
  itemcode: string
  description: string | null
  item_picture_name: string | null
  cost_price: number | null
  suggested_sale_price: number | null
  product_group_code: string
  diameter: number | null
  height: number | null
  location_icon_nl: string | null
}

function buildCandidateSpec(c: Candidate): string {
  const parts: string[] = []
  if (c.height && c.height > 0)
    parts.push(`H ${Math.round(c.height)} cm`)
  if (c.diameter && c.diameter > 0)
    parts.push(`Ø ${Math.round(c.diameter)} cm`)
  if (c.location_icon_nl) parts.push(c.location_icon_nl)
  return parts.join(' · ')
}

// Score van een combinatie voor een specifieke vervangingsslot. Hoger
// = beter. We tellen: potmaat-nabijheid + lichtbehoefte-match +
// soort-naam overlap (volledige soortnaam, anders genus).
function scoreCandidate(c: Candidate, slot: ReplacementSlot): number {
  let score = 0
  // Voorkeur: de potmaat die de tech expliciet opgaf. Anders de
  // huidige plant-potmaat als ruwe schatting.
  const p = slot.potDiameterCm ?? slot.currentPotDiameterCm
  if (p && c.diameter && c.diameter > 0) {
    const diff = Math.abs(c.diameter - p)
    if (diff === 0) score += 100
    else if (diff <= 2) score += 80 - diff * 10
    else if (diff <= 5) score += 40 - diff * 5
    else score += Math.max(0, 20 - diff)
  }
  const lightTarget = slot.light ? LIGHT_TO_CATALOG_MAP[slot.light] : null
  if (lightTarget && c.location_icon_nl === lightTarget) score += 50
  if (slot.oldPlantSpecies && c.description) {
    const speciesLower = slot.oldPlantSpecies.toLowerCase()
    const descLower = c.description.toLowerCase()
    if (descLower.includes(speciesLower)) score += 100
    else {
      const genus = speciesLower.split(/\s+/)[0]
      if (genus && genus.length > 2 && descLower.includes(genus)) {
        score += 80
      }
    }
  }
  return score
}

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
  let initialLines: InitialLineInput[] = []
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
          id, plant_id, photo_url,
          followup_replace, health_status,
          replacement_light_level, replacement_height_cm,
          replacement_pot_diameter_cm, replacement_is_hanging,
          replacement_care_level, replacement_needs_outer_pot,
          replacement_notes,
          plants ( nickname, species, pot_size_code, photo_url )
        `
        )
        .eq('visit_id', visitId)
        // Zowel planten die vervangen worden (followup_replace=true) als
        // dode planten waar de tech expliciet "Nee" antwoordde — die laatste
        // verschijnen in de offerte als "niet voorgesteld" met de reden.
        .or(
          'followup_replace.eq.true,and(health_status.eq.dead,followup_replace.eq.false)'
        )

      // Voor de meeste planten is er op de "dood"-rij geen foto
      // ge-upload (de plant is via standaard onderhoud of SQL gemarkeerd).
      // We zoeken daarom per plant de meest recente foto uit ALLE eerdere
      // onderhoudsbeurten als fallback.
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
          } | null
          const plantId = (row.plant_id as string | null) ?? null
          const lightRaw = row.replacement_light_level
          const light =
            lightRaw === 'high' || lightRaw === 'medium' || lightRaw === 'low'
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
            ? Math.round(
                (potSize.minDiameter + potSize.maxDiameter) / 2
              )
            : null
          const cascadedPhoto =
            (row.photo_url as string | null) ??
            (plantId ? latestPhotoByPlant.get(plantId) ?? null : null) ??
            plant?.photo_url ??
            null
          const wantsReplacement = Boolean(row.followup_replace)
          return {
            visitPlantId: row.id as string,
            photoUrl: cascadedPhoto,
            currentPotLabel,
            currentPotDiameterCm,
            wantsReplacement,
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

      // Automatisch voorstel per slot: één catalogus-query, score per
      // slot in JS — snel ook bij 5+ slots.
      if (slots.length > 0) {
        const { data: candidatesRaw } = await supabase
          .from('v_nieuwkoop_with_margin')
          .select(
            'itemcode, description, item_picture_name, cost_price, suggested_sale_price, product_group_code, diameter, height, location_icon_nl'
          )
          .eq('product_group_code', '275')
          .eq('is_stock_item', true)
          .not('item_picture_name', 'is', null)
          .limit(5000)

        const candidates = (candidatesRaw ?? []) as Candidate[]

        for (const slot of slots) {
          // "Nee, niet vervangen" → meteen een uitlegregel (€0) met
          // de reden uit de onderhoud-notitie als beschrijving.
          if (!slot.wantsReplacement) {
            initialLines.push({
              slotId: slot.visitPlantId,
              lineType: 'custom',
              supplier: null,
              itemcode: null,
              name: `Vervanging voor ${slot.oldPlantName} — niet voorgesteld`,
              description: slot.notes ?? '',
              spec: null,
              imageUrl: null,
              supplierUnitPriceCents: null,
              unitPriceCents: 0,
              quantity: 1,
            })
            continue
          }

          let best: Candidate | null = null
          // Start onder 0 zodat we ook iets voorstellen als geen
          // enkel signaal raakt — de tech kan altijd "wijzig" klikken.
          let bestScore = -1
          for (const c of candidates) {
            const s = scoreCandidate(c, slot)
            if (s > bestScore) {
              bestScore = s
              best = c
            }
          }
          if (best) {
            const sale = best.suggested_sale_price ?? 0
            const cost = best.cost_price ?? null
            initialLines.push({
              slotId: slot.visitPlantId,
              lineType: 'combination',
              supplier: 'nieuwkoop',
              itemcode: best.itemcode,
              name: best.description || best.itemcode,
              description: null,
              spec: buildCandidateSpec(best) || null,
              imageUrl: best.item_picture_name
                ? `/api/nieuwkoop/image/${encodeURIComponent(best.itemcode)}`
                : null,
              supplierUnitPriceCents:
                cost != null ? Math.round(cost * 100) : null,
              unitPriceCents: sale > 0 ? Math.round(sale * 100) : 0,
              quantity: 1,
            })
          }
        }
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
          initialLines={initialLines}
        />
      </div>
    </main>
  )
}
