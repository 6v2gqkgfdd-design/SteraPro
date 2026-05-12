/**
 * Auto-aggregatie van verbruiksgoederen voor een onderhoudsbeurt.
 *
 * Centraal punt dat álle "[auto:*]"-rijen herberekent op basis van
 * de huidige state van de beurt. Wordt aangeroepen vanuit:
 *   - de plant-onderhoud save (na elke wijziging aan een plant)
 *   - applyStandardMaintenance (bulk-insert van standaard onderhoud)
 *
 * Wat er automatisch in komt:
 *   1. Binnenpot per maat (één regel per pot-code, aantal = aantal
 *      planten die naar die maat verpot werden).
 *   2. Potgrond — totaal in liters = ½ × som van potvolumes.
 *   3. Spring Bladglans 750ml — altijd 1 spuitbus, standaard
 *      verbruik op elk onderhoud.
 *   4. Voeding (Pokon) — altijd 1 flesje, standaard mengsel in
 *      water op elk onderhoud.
 *   5. Neemolie — 1 flesje, alleen als er minstens één zieke plant
 *      in de beurt zit (niet dood, niet voor vervanging).
 *
 * Idempotent: bij elke run worden eerst alle auto-rijen weggekuist
 * en daarna opnieuw aangemaakt. Manuele toevoegingen (zonder auto-
 * marker in notes) blijven ongemoeid.
 */

import { findPotSize, formatPotSize } from './pot-sizes'

// Het echte type van de Supabase-clients (client- én server-side)
// verschilt subtiel, dus we vragen alleen de minimale interface die
// we hier gebruiken. Loose typing is hier OK want we doen runtime-
// only checks tegen kolommen die in de schema-migrations vastliggen.
type AnySupabase = {
  from: (table: string) => any
}

export async function recomputeAutoConsumables(
  supabase: AnySupabase,
  visitId: string
): Promise<void> {
  // 1) Alle bestaande auto-rijen voor deze visit weggooien.
  await supabase
    .from('maintenance_visit_consumables')
    .delete()
    .eq('visit_id', visitId)
    .like('notes', '%[auto:%')

  // 2) State van de beurt ophalen (plus de gelinkte plants).
  const { data: visitPlantsRaw } = await supabase
    .from('maintenance_visit_plants')
    .select(
      `plant_id, health_status, followup_replace, action_repotted,
       plants ( pot_size_code, status )`
    )
    .eq('visit_id', visitId)

  const rows: any[] = visitPlantsRaw ?? []

  const plantOf = (row: any) =>
    Array.isArray(row.plants) ? row.plants[0] : row.plants

  // "Levend en in scope" = telt mee voor verpot- en zieke-detectie.
  const isLivePlant = (row: any): boolean => {
    if (row.followup_replace) return false
    if (row.health_status === 'dead') return false
    const p = plantOf(row)
    if (p?.status === 'dead' || p?.status === 'replacement_needed')
      return false
    return true
  }

  // ── Verpot-aggregaten (binnenpot + potgrond) ────────────────────
  const sizeCounts = new Map<string, number>()
  let totalLiters = 0
  let repottedCount = 0

  for (const row of rows) {
    if (!row.action_repotted) continue
    if (!isLivePlant(row)) continue
    const code = plantOf(row)?.pot_size_code
    const pot = findPotSize(code)
    if (!pot) continue
    sizeCounts.set(code, (sizeCounts.get(code) ?? 0) + 1)
    totalLiters += pot.liters
    repottedCount += 1
  }

  // Binnenpot — één regel per maat
  const binnenpotMarker = `[auto:repot-pot:${visitId}]`
  for (const [code, count] of sizeCounts.entries()) {
    const pot = findPotSize(code)
    if (!pot) continue
    const catalogName = `Binnenpot ${code}`
    const { data: catalogItem } = await supabase
      .from('consumable_catalog')
      .select('id')
      .eq('name', catalogName)
      .eq('active', true)
      .maybeSingle()
    await supabase.from('maintenance_visit_consumables').insert([
      {
        visit_id: visitId,
        catalog_item_id: catalogItem?.id ?? null,
        custom_name: catalogItem ? null : catalogName,
        quantity: count,
        unit: 'stuk',
        notes: `${formatPotSize(pot)} ${binnenpotMarker}`.trim(),
      },
    ])
  }

  // Potgrond — één regel met totaal in liters
  if (totalLiters > 0) {
    const soilLiters = Math.round((totalLiters / 2) * 100) / 100
    const soilMarker = `[auto:repot-soil:${visitId}]`
    const { data: potgrondItem } = await supabase
      .from('consumable_catalog')
      .select('id')
      .eq('name', 'Potgrond')
      .eq('active', true)
      .maybeSingle()
    await supabase.from('maintenance_visit_consumables').insert([
      {
        visit_id: visitId,
        catalog_item_id: potgrondItem?.id ?? null,
        custom_name: potgrondItem ? null : 'Potgrond',
        quantity: soilLiters,
        unit: 'L',
        notes:
          `Voor ${repottedCount} verpotte plant` +
          `${repottedCount === 1 ? '' : 'en'} ${soilMarker}`.trim(),
      },
    ])
  }

  // ── Spring Bladglans — standaard 1 spuitbus per beurt ───────────
  const bladglansMarker = `[auto:standard-bladglans:${visitId}]`
  const { data: bladglansItem } = await supabase
    .from('consumable_catalog')
    .select('id')
    .eq('name', 'Spring Bladglans 750ml')
    .eq('active', true)
    .maybeSingle()
  await supabase.from('maintenance_visit_consumables').insert([
    {
      visit_id: visitId,
      catalog_item_id: bladglansItem?.id ?? null,
      custom_name: bladglansItem ? null : 'Spring Bladglans 750ml',
      quantity: 1,
      unit: 'spuitbus',
      notes: `Standaard bij elk onderhoud ${bladglansMarker}`,
    },
  ])

  // ── Voeding (Pokon) — standaard 1 flesje gemengd in water per beurt
  const voedingMarker = `[auto:standard-voeding:${visitId}]`
  const { data: voedingItem } = await supabase
    .from('consumable_catalog')
    .select('id')
    .eq('name', 'Voeding (Pokon)')
    .eq('active', true)
    .maybeSingle()
  await supabase.from('maintenance_visit_consumables').insert([
    {
      visit_id: visitId,
      catalog_item_id: voedingItem?.id ?? null,
      custom_name: voedingItem ? null : 'Voeding (Pokon)',
      quantity: 1,
      unit: 'flesje',
      notes: `Standaard bij elk onderhoud ${voedingMarker}`,
    },
  ])

  // ── Neemolie — alleen als er zieke planten in de beurt zitten ──
  const hasSickPlant = rows.some((row) => {
    if (!isLivePlant(row)) return false
    const p = plantOf(row)
    return (
      row.health_status === 'needs_attention' ||
      p?.status === 'needs_attention' ||
      p?.status === 'maintenance_due'
    )
  })

  if (hasSickPlant) {
    const neemMarker = `[auto:sick-neemolie:${visitId}]`
    const { data: neemItem } = await supabase
      .from('consumable_catalog')
      .select('id')
      .eq('name', 'Neemolie')
      .eq('active', true)
      .maybeSingle()
    await supabase.from('maintenance_visit_consumables').insert([
      {
        visit_id: visitId,
        catalog_item_id: neemItem?.id ?? null,
        custom_name: neemItem ? null : 'Neemolie',
        quantity: 1,
        unit: 'flesje',
        notes: `Behandeling zieke planten ${neemMarker}`,
      },
    ])
  }
}
