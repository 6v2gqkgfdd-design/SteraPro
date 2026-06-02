import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { findPotSize } from '@/lib/pot-sizes'
import QuoteBuilder, {
  type LocationOption,
  type VisitPrefill,
  type ReplacementSlot,
  type InitialLineInput,
} from './quote-builder'
import { formatRoomLabel } from '@/lib/rooms'
import { analyzeReplacementPhotos } from '@/lib/ai/photo-analysis'
import { planDelivery } from '@/lib/transport'
import { loadCatalogItems } from '@/lib/catalog-items'

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
  // length zit op nieuwkoop_products (niet in de view); we mergen het
  // in nadat we de candidates ophalen, en gebruiken het om de pot-vorm
  // van de kandidaat te bepalen (Rond = enkel diameter, Hoekig =
  // length ingevuld).
  length?: number | null
  // Pot-merk (Brand-tag) — gebruikt om dezelfde huisstijl voor te stellen.
  brand?: string | null
}

// Pot-merk uit de Nieuwkoop Brand-tag halen.
function brandFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null
  const t = (
    tags as Array<{ Code?: string; Values?: Array<{ Description_NL?: string }> }>
  ).find((x) => x?.Code === 'Brand')
  const b = t?.Values?.[0]?.Description_NL
  return b ? b.trim() : null
}

function candidateShape(c: Candidate): 'Rond' | 'Hoekig' | null {
  const len = Number(c.length ?? 0)
  const d = Number(c.diameter ?? 0)
  if (len > 0 && d <= 0) return 'Hoekig'
  if (d > 0 && len <= 0) return 'Rond'
  return null
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
function scoreCandidate(
  c: Candidate,
  slot: ReplacementSlot,
  companyBrand: string | null
): number {
  let score = 0
  // Huisstijl: stevige voorrang voor combinaties van hetzelfde pot-merk
  // als het bedrijf gewoon is (visuele consistentie op locatie). Andere
  // signalen (potmaat, soort) kunnen dit nog overstijgen → "voorkeur".
  if (
    companyBrand &&
    c.brand &&
    c.brand.toLowerCase() === companyBrand.toLowerCase()
  ) {
    score += 130
  }
  // Voorkeur-volgorde voor de doelpotmaat:
  //   1. wat de tech expliciet ingaf in het condities-blok,
  //   2. de huidige pot van de plant (pot_size_code),
  //   3. (verderop in de pipeline) de AI-schatting — alleen als 1 én
  //      2 ontbreken; daarom hier in dezelfde volgorde lezen.
  const p = slot.potDiameterCm ?? slot.currentPotDiameterCm
  if (p && c.diameter && c.diameter > 0) {
    const diff = Math.abs(c.diameter - p)
    // Pot weegt zwaarder dan andere signalen — voor Stera is dat
    // het belangrijkste criterium voor een passende combinatie.
    if (diff === 0) score += 150
    else if (diff <= 2) score += 120 - diff * 15
    else if (diff <= 5) score += 60 - diff * 8
    else score += Math.max(0, 30 - diff * 2)
  }
  const lightTarget = slot.light ? LIGHT_TO_CATALOG_MAP[slot.light] : null
  if (lightTarget && c.location_icon_nl === lightTarget) score += 50
  if (slot.oldPlantSpecies && c.description) {
    const speciesLower = slot.oldPlantSpecies.toLowerCase()
    const descLower = c.description.toLowerCase()
    if (descLower.includes(speciesLower)) score += 200
    else {
      const genus = speciesLower.split(/\s+/)[0]
      if (genus && genus.length > 2 && descLower.includes(genus)) {
        score += 150
      }
    }
  }
  // Hoogte (alleen als we een doelhoogte hebben — manueel of via AI).
  if (slot.heightCm && c.height && c.height > 0) {
    const diff = Math.abs(c.height - slot.heightCm)
    if (diff <= 20) score += 50
    else if (diff <= 50) score += 20
    else if (diff > 100) score -= 30
  }
  // Pot-vorm: grote boost wanneer de kandidaat dezelfde stijl heeft
  // als de oude plant (Rond ↔ Rond, Hoekig ↔ Hoekig). Negatieve
  // boost bij verkeerd type zodat een rond pot nooit ineens als
  // hoekig wordt voorgesteld als er ook ronde kandidaten zijn.
  if (slot.potShape) {
    const cs = candidateShape(c)
    if (cs && cs === slot.potShape) score += 100
    else if (cs && cs !== slot.potShape) score -= 75
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

// Bepaalt het huisstijl-merk van een bedrijf:
//  1. handmatig ingesteld op de bedrijfsfiche (companies.preferred_pot_brand),
//  2. anders afgeleid uit het meest gebruikte merk in eerdere offertes.
async function resolveCompanyBrand(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string | null
): Promise<string | null> {
  if (!companyId) return null
  const { data: comp } = await supabase
    .from('companies')
    .select('preferred_pot_brand')
    .eq('id', companyId)
    .maybeSingle()
  const pref = (comp as { preferred_pot_brand?: string | null } | null)
    ?.preferred_pot_brand
  if (pref && pref.trim()) return pref.trim()

  // Historiek: itemcodes uit eerdere offerteregels van dit bedrijf.
  const { data: q } = await supabase
    .from('quotes')
    .select('id')
    .eq('company_id', companyId)
  const ids = (q ?? []).map((x: { id: string }) => x.id)
  if (ids.length === 0) return null
  const { data: lines } = await supabase
    .from('quote_lines')
    .select('nieuwkoop_itemcode')
    .in('quote_id', ids)
    .not('nieuwkoop_itemcode', 'is', null)
  const codes = Array.from(
    new Set(
      (lines ?? [])
        .map((l: { nieuwkoop_itemcode: string | null }) => l.nieuwkoop_itemcode)
        .filter((c): c is string => Boolean(c))
    )
  )
  if (codes.length === 0) return null
  const { data: prods } = await supabase
    .from('nieuwkoop_products')
    .select('itemcode, tags')
    .in('itemcode', codes)
  const counts = new Map<string, number>()
  for (const p of (prods ?? []) as Array<{ tags: unknown }>) {
    const b = brandFromTags(p.tags)
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  let bestBrand: string | null = null
  let bestN = 0
  for (const [b, n] of counts) {
    if (n > bestN) {
      bestN = n
      bestBrand = b
    }
  }
  return bestBrand
}

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams?: Promise<{ visit?: string; company?: string }>
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
  let companyBrand: string | null = null
  const params = searchParams ? await searchParams : {}
  const visitId = params?.visit
  const companyParam =
    typeof params?.company === 'string' ? params.company : null

  // Het vervangingsvoorstel komt uit "flagged" planten — uit één beurt
  // (?visit=) of uit ALLE openstaande vervangingen van een klant
  // (?company=, alle beurten samen in één offerte).
  const FLAGGED_SELECT = `
        id, plant_id, photo_url,
        followup_replace, health_status,
        replacement_light_level, replacement_height_cm,
        replacement_pot_diameter_cm, replacement_is_hanging,
        replacement_care_level, replacement_needs_outer_pot,
        replacement_notes,
        plants (
          nickname, species, pot_size_code, photo_url,
          locations ( id, name ),
          rooms ( id, name, floor )
        )
      `
  // Te vervangen (followup_replace=true) + dode planten waar "Nee" op
  // geantwoord is (verschijnen als "niet voorgesteld" met reden).
  const FLAGGED_FILTER =
    'followup_replace.eq.true,and(health_status.eq.dead,followup_replace.eq.false)'

  type CompanyLite = {
    id?: string
    name?: string | null
    contact_name?: string | null
    email?: string | null
  }
  let flagged: Array<Record<string, unknown>> = []
  let company: CompanyLite | null = null
  let prefillLocationId: string | null = null
  let prefillSourceVisitId: string | null = null
  let hasContext = false

  if (visitId) {
    const { data: visit } = await supabase
      .from('maintenance_visits')
      .select(
        `id, location_id, company_id, companies ( id, name, contact_name, email ), locations ( id, name )`
      )
      .eq('id', visitId)
      .maybeSingle()
    if (visit) {
      const { data } = await supabase
        .from('maintenance_visit_plants')
        .select(FLAGGED_SELECT)
        .eq('visit_id', visitId as string)
        .or(FLAGGED_FILTER)
      flagged = (data ?? []) as Array<Record<string, unknown>>
      company = one(visit.companies) as CompanyLite | null
      prefillLocationId = (visit.location_id as string | null) ?? null
      prefillSourceVisitId = (visit.id as string) ?? null
      hasContext = true
    }
  } else if (companyParam) {
    const { data: comp } = await supabase
      .from('companies')
      .select('id, name, contact_name, email')
      .eq('id', companyParam)
      .maybeSingle()
    if (comp) {
      company = comp as unknown as CompanyLite
      const { data: visits } = await supabase
        .from('maintenance_visits')
        .select('id')
        .eq('company_id', companyParam)
      const visitIds = (visits ?? []).map((v: { id: string }) => v.id)
      if (visitIds.length > 0) {
        const { data } = await supabase
          .from('maintenance_visit_plants')
          .select(FLAGGED_SELECT)
          .in('visit_id', visitIds)
          .or(FLAGGED_FILTER)
        let rows = (data ?? []) as Array<Record<string, unknown>>
        // Dubbels vermijden: planten die al op een lopende offerte staan.
        const { data: existingQuotes } = await supabase
          .from('quotes')
          .select('id')
          .eq('company_id', companyParam)
          .not('status', 'in', '(declined,cancelled,expired)')
        const qIds = (existingQuotes ?? []).map((x: { id: string }) => x.id)
        if (qIds.length > 0) {
          const { data: usedLines } = await supabase
            .from('quote_lines')
            .select('source_visit_plant_id')
            .in('quote_id', qIds)
            .not('source_visit_plant_id', 'is', null)
          const used = new Set(
            (usedLines ?? []).map(
              (l: { source_visit_plant_id: string | null }) =>
                l.source_visit_plant_id
            )
          )
          rows = rows.filter((r) => !used.has(r.id as string))
        }
        flagged = rows
      }
      hasContext = true
    }
  }

  if (hasContext) {

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

      // Huisstijl-merk van dit bedrijf (fiche of historiek) — voor de
      // suggestie-score én als standaard in de catalogus-picker.
      companyBrand = await resolveCompanyBrand(supabase, company?.id ?? null)

      const slots: ReplacementSlot[] = (flagged ?? []).map(
        (row: Record<string, unknown>) => {
          const plant = one(row.plants) as {
            nickname?: string | null
            species?: string | null
            pot_size_code?: string | null
            photo_url?: string | null
            rooms?: unknown
            locations?: unknown
          } | null
          const room = one(plant?.rooms) as {
            id?: string | null
            name?: string | null
            floor?: string | null
          } | null
          const roomLabel = room?.name
            ? formatRoomLabel(room.name, room.floor ?? null)
            : null
          const loc = one(plant?.locations) as {
            id?: string | null
            name?: string | null
          } | null
          const locationLabel = loc?.name ?? null
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
            roomId: (room?.id as string | null) ?? null,
            roomLabel,
            locationId: (loc?.id as string | null) ?? null,
            locationLabel,
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
            potShape: null,
            isHanging: Boolean(row.replacement_is_hanging),
            careLevel,
            needsOuterPot: row.replacement_needs_outer_pot !== false,
            notes: (row.replacement_notes as string | null) ?? null,
          }
        }
      )

      // AI-foto-analyse: vul ontbrekende condities aan (hoogte,
      // lichtbehoefte, potmaat) op basis van de foto. Eén batched call
      // naar Claude Vision voor alle slots samen.
      if (slots.length > 0) {
        const ai = await analyzeReplacementPhotos(
          slots.map((s) => ({
            visitPlantId: s.visitPlantId,
            photoUrl: s.photoUrl,
            oldPlantName: s.oldPlantName,
            oldPlantSpecies: s.oldPlantSpecies,
          }))
        )
        for (const slot of slots) {
          const insight = ai.get(slot.visitPlantId)
          if (!insight) continue
          // Manueel ingegeven waardes (door de tech) en de gekende
          // pot van de plant zelf hebben voorrang op de AI-schatting.
          if (slot.heightCm == null && insight.heightCm != null) {
            slot.heightCm = insight.heightCm
          }
          if (slot.light == null && insight.light != null) {
            slot.light = insight.light
          }
          if (
            slot.potDiameterCm == null &&
            slot.currentPotDiameterCm == null &&
            insight.potDiameterCm != null
          ) {
            slot.potDiameterCm = insight.potDiameterCm
          }
          if (slot.potShape == null && insight.potShape != null) {
            slot.potShape = insight.potShape
          }
        }
      }

      visitPrefill = {
        visitId: prefillSourceVisitId,
        companyId: company?.id ?? null,
        locationId: prefillLocationId,
        customerName: company?.contact_name ?? '',
        customerEmail: company?.email ?? '',
        slots,
      }

      // Automatisch voorstel per slot: één catalogus-query, score per
      // slot in JS — snel ook bij 5+ slots. We laten 'is_stock_item'
      // bewust weg uit de filter — voor sommige rijen is dat veld NULL
      // in de sync, wat de lijst onterecht leegmaakt. Niet-voorradige
      // suggesties zijn beter dan geen suggesties (de tech kan altijd
      // wisselen).
      if (slots.length > 0) {
        const [
          { data: candidatesRaw, error: candError },
          { data: photoMeta, error: photoMetaError },
        ] = await Promise.all([
          supabase
            .from('v_nieuwkoop_with_margin')
            .select(
              'itemcode, description, item_picture_name, cost_price, suggested_sale_price, product_group_code, diameter, height, location_icon_nl'
            )
            .eq('product_group_code', '275')
            .not('item_picture_name', 'is', null)
            .neq('item_picture_name', '')
            .limit(5000),
          supabase
            .from('nieuwkoop_products')
            .select('itemcode, has_image, item_variety_nl, length, tags')
            .eq('product_group_code', '275'),
        ])

        if (candError) {
          // eslint-disable-next-line no-console
          console.error('[auto-suggest] candidate fetch error', candError)
        }

        // Foto-filter alleen toepassen als we effectief een lijst van
        // OK-items hebben (anders vallen we terug op alles met een
        // ingevulde foto-naam — beter dan een leeg voorstel).
        // Mosmuren (item_variety_nl bevat een mos-woord) altijd uit
        // de kandidatenset — die kunnen nooit een dode plant vervangen.
        const photoOkSet = new Set<string>()
        const mosmuurSet = new Set<string>()
        const lengthByCode = new Map<string, number | null>()
        const brandByCode = new Map<string, string | null>()
        const MOS_WORDS = ['bolmos', 'platmos', 'rendiermos', 'bol- en']
        if (!photoMetaError && photoMeta) {
          for (const r of photoMeta as Array<{
            itemcode: string
            has_image: boolean | null
            item_variety_nl: string | null
            length: number | null
            tags: unknown
          }>) {
            if (!r.itemcode) continue
            if (r.has_image !== false) photoOkSet.add(r.itemcode)
            const v = (r.item_variety_nl ?? '').toLowerCase()
            if (MOS_WORDS.some((w) => v.includes(w))) {
              mosmuurSet.add(r.itemcode)
            }
            lengthByCode.set(r.itemcode, r.length)
            brandByCode.set(r.itemcode, brandFromTags(r.tags))
          }
        }
        const photoFilterUsable = photoOkSet.size > 0
        const candidates = ((candidatesRaw ?? []) as Candidate[])
          .filter(
            (c) =>
              !mosmuurSet.has(c.itemcode) &&
              (!photoFilterUsable || photoOkSet.has(c.itemcode))
          )
          .map((c) => ({
            ...c,
            length: lengthByCode.get(c.itemcode) ?? null,
            brand: brandByCode.get(c.itemcode) ?? null,
          }))

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
            const s = scoreCandidate(c, slot, companyBrand)
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

  // Levering-regel automatisch toevoegen. Drie vaste tarieven op
  // basis van het plantsubtotaal: €99 onder €300, €49 tussen
  // €300-€749, gratis vanaf €750. Tech kan altijd manueel aanpassen.
  const nonDeliverySubtotalCents = initialLines.reduce(
    (sum, l) => sum + l.unitPriceCents * Math.max(1, l.quantity),
    0
  )
  const delivery = planDelivery(nonDeliverySubtotalCents)
  initialLines.push({
    slotId: null,
    lineType: 'transport',
    supplier: null,
    itemcode: null,
    name: delivery.name,
    description: delivery.description,
    spec: null,
    imageUrl: null,
    supplierUnitPriceCents: null,
    unitPriceCents: delivery.unitPriceCents,
    quantity: 1,
  })

  // Volledige catalogus (met inkoop, intern) voor het kies-venster.
  const catalogItems = await loadCatalogItems(supabase, { withCost: true })

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
              : 'Kies de klant, voeg een combinatie toe uit de catalogus, en bewaar de offerte.'}
          </p>
        </div>
        <QuoteBuilder
          locations={locationOptions}
          visitPrefill={visitPrefill}
          initialLines={initialLines}
          companyBrand={companyBrand}
          catalogItems={catalogItems}
        />
      </div>
    </main>
  )
}
