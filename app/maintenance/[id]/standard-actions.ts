'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  STANDARD_MAINTENANCE_ACTIONS,
  STANDARD_MAINTENANCE_ACTIONS_ARTIFICIAL,
  STANDARD_MAINTENANCE_HEALTH_STATUS,
} from '@/lib/standard-maintenance'
import { recomputeAutoConsumables } from '@/lib/auto-consumables'

/**
 * Pas het standaard onderhoud toe op alle planten van de locatie die
 * nog GEEN visit_plant-record hebben in deze beurt. In de praktijk:
 * Jelle wandelt rond, scant alleen de zieke planten (die krijgen een
 * eigen ingave), en klikt aan het einde deze knop. Alle resterende
 * planten worden automatisch met water/voeding/snoei/controle/draaien/
 * bladglans gemarkeerd.
 *
 * Geen overschrijven van bestaande records — als een plant al manueel
 * is geregistreerd blijft die ongewijzigd.
 */
export async function applyStandardMaintenance(formData: FormData) {
  const visitId = String(formData.get('visit_id') || '')
  if (!visitId) return

  const supabase = await createClient()

  // 1) Visit + gekoppelde ruimtes ophalen.
  const { data: visit, error: visitErr } = await supabase
    .from('maintenance_visits')
    .select('id, location_id, maintenance_visit_rooms ( room_id )')
    .eq('id', visitId)
    .maybeSingle()

  if (visitErr || !visit?.location_id) {
    console.error('[standard maintenance] visit not found', visitErr)
    return
  }

  const roomIds: string[] = Array.isArray(visit.maintenance_visit_rooms)
    ? (visit.maintenance_visit_rooms as Array<{ room_id: string | null }>)
        .map((r) => r.room_id)
        .filter((id): id is string => Boolean(id))
    : []

  // 2) Planten ophalen — gescoped op ruimtes als die gekoppeld zijn,
  //    anders alle planten op de locatie.
  let plantsQuery = supabase.from('plants').select('id, is_artificial, status')
  if (roomIds.length > 0) {
    plantsQuery = plantsQuery.in('room_id', roomIds)
  } else {
    plantsQuery = plantsQuery.eq('location_id', visit.location_id)
  }
  const { data: plants, error: plantsErr } = await plantsQuery

  if (plantsErr) {
    console.error('[standard maintenance] plants fetch failed', plantsErr)
    return
  }

  // 3) Alle al-geregistreerde plant_id's voor deze beurt.
  const { data: existing, error: existingErr } = await supabase
    .from('maintenance_visit_plants')
    .select('plant_id')
    .eq('visit_id', visitId)

  if (existingErr) {
    console.error('[standard maintenance] existing fetch failed', existingErr)
    return
  }

  const handledIds = new Set((existing ?? []).map((r) => r.plant_id))
  const toApply = (plants ?? []).filter((p) => !handledIds.has(p.id))

  if (toApply.length === 0) {
    revalidatePath(`/maintenance/${visitId}`)
    return
  }

  // 4) Bulk-insert visit_plant records met standaard acties.
  // Plastiek/kunstplanten krijgen een ander set van vinkjes.
  // Dode planten krijgen GEEN verzorging — enkel een controle —
  // en hun health_status blijft op 'dead' staan zodat ze niet
  // valselijk als "gezond" eindigen op de werkbon.
  const rows = toApply.map((p: any) => {
    const status = (p.status as string | null) || 'healthy'

    if (status === 'dead' || status === 'replacement_needed') {
      return {
        visit_id: visitId,
        plant_id: p.id,
        health_status: 'dead',
        action_checked: true,
      }
    }

    const attentionLike =
      status === 'needs_attention' || status === 'maintenance_due'

    return {
      visit_id: visitId,
      plant_id: p.id,
      health_status: attentionLike
        ? 'needs_attention'
        : STANDARD_MAINTENANCE_HEALTH_STATUS,
      ...(p.is_artificial
        ? STANDARD_MAINTENANCE_ACTIONS_ARTIFICIAL
        : STANDARD_MAINTENANCE_ACTIONS),
    }
  })

  const { error: insertErr } = await supabase
    .from('maintenance_visit_plants')
    .insert(rows)

  if (insertErr) {
    console.error('[standard maintenance] bulk insert failed', insertErr)
    return
  }

  // Auto-verbruiksgoederen (bladglans, voeding, eventueel neemolie
  // bij zieke planten, plus binnenpot/potgrond bij verpotting) zijn
  // afhankelijk van de huidige plant-state. Direct na de bulk-insert
  // herrekenen, anders ontbreekt bladglans/voeding bij beurten waar
  // Jelle alleen op de bulk-knop drukt zonder planten individueel te
  // openen.
  try {
    await recomputeAutoConsumables(supabase, visitId)
  } catch (autoErr) {
    console.error(
      '[standard maintenance] recompute auto consumables',
      autoErr
    )
  }

  revalidatePath(`/maintenance/${visitId}`)
}
