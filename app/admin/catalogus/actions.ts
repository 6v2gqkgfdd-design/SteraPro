'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, error: 'Niet ingelogd.' as const }
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) return { supabase, user, error: 'Geen beheerder.' as const }
  return { supabase, user, error: null }
}

/** Item-level: één itemcode aanbieden of uitzetten. */
export async function setItemOffered(itemcode: string, offered: boolean): Promise<Result> {
  const { supabase, error: authErr } = await requireStaff()
  if (authErr) return { ok: false, error: authErr }
  if (!itemcode) return { ok: false, error: 'Geen itemcode' }
  const { error } = await supabase.from('shopify_offered_items').upsert(
    {
      itemcode,
      offered,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'itemcode' }
  )
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/catalogus')
  return { ok: true }
}

/** Item-level bulk. */
export async function setItemsOfferedBulk(
  itemcodes: string[],
  offered: boolean
): Promise<Result> {
  const { supabase, error: authErr } = await requireStaff()
  if (authErr) return { ok: false, error: authErr }
  if (itemcodes.length === 0) return { ok: true }
  const now = new Date().toISOString()
  const rows = itemcodes.map((itemcode) => ({ itemcode, offered, updated_at: now }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('shopify_offered_items')
      .upsert(rows.slice(i, i + 500), { onConflict: 'itemcode' })
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/admin/catalogus')
  return { ok: true }
}

/** Markeer change-events als bekeken. */
export async function acknowledgeChanges(changeIds: string[]): Promise<Result> {
  const { supabase, user, error: authErr } = await requireStaff()
  if (authErr) return { ok: false, error: authErr }
  if (changeIds.length === 0) return { ok: true }
  const { error } = await supabase
    .from('catalog_changes')
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user?.id ?? null,
    })
    .in('id', changeIds)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/catalogus')
  return { ok: true }
}

/** Alle open changes van één type of alles markeren. */
export async function acknowledgeAllOpen(changeType?: string): Promise<Result> {
  const { supabase, user, error: authErr } = await requireStaff()
  if (authErr) return { ok: false, error: authErr }
  let q = supabase
    .from('catalog_changes')
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user?.id ?? null,
    })
    .is('acknowledged_at', null)
  if (changeType) q = q.eq('change_type', changeType)
  const { error } = await q
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/catalogus')
  return { ok: true }
}

/**
 * Zet of wist de margefactor op item-niveau (scope = item).
 * factor = null → item-override verwijderen (terug naar groep/default).
 * factor > 0 → upsert in margin_config.
 */
/**
 * Handmatige standplaats op product_enrichment.
 * binnen/buiten: true/false; beide false = wissen van manuele locatie.
 * Als Nieuwkoop al Location heeft, blijft die effectief primair — enrichment is fallback.
 */
export async function setItemLocation(
  itemcode: string,
  opts: { binnen: boolean; buiten: boolean }
): Promise<Result> {
  const { supabase, error: authErr } = await requireStaff()
  if (authErr) return { ok: false, error: authErr }
  const code = itemcode?.trim()
  if (!code) return { ok: false, error: 'Geen itemcode' }

  const binnen = !!opts.binnen
  const buiten = !!opts.buiten

  // Beide uit = enrichment-locatie wissen (niet de hele rij)
  if (!binnen && !buiten) {
    const { data: existing } = await supabase
      .from('product_enrichment')
      .select('itemcode, ready_for_shopify, notes')
      .eq('itemcode', code)
      .maybeSingle()
    if (!existing) return { ok: true }
    const { error } = await supabase
      .from('product_enrichment')
      .update({
        location_binnen: null,
        location_buiten: null,
        location_source: null,
        updated_at: new Date().toISOString(),
      })
      .eq('itemcode', code)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/catalogus')
    return { ok: true }
  }

  const row = {
    itemcode: code,
    location_binnen: binnen,
    location_buiten: buiten,
    location_source: 'manual' as const,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('product_enrichment').upsert(row, {
    onConflict: 'itemcode',
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/catalogus')
  return { ok: true }
}

export async function setItemMarginFactor(
  itemcode: string,
  factor: number | null
): Promise<Result & { marginFactor?: number | null }> {
  const { supabase, error: authErr } = await requireStaff()
  if (authErr) return { ok: false, error: authErr }
  if (!itemcode?.trim()) return { ok: false, error: 'Geen itemcode' }

  const code = itemcode.trim()

  // Wissen: item-override weg
  if (factor == null) {
    const { error } = await supabase
      .from('margin_config')
      .delete()
      .eq('scope', 'item')
      .eq('scope_value', code)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/catalogus')
    return { ok: true, marginFactor: null }
  }

  const f = Number(factor)
  if (!Number.isFinite(f) || f <= 0) {
    return { ok: false, error: 'Margefactor moet groter zijn dan 0 (bv. 2 = 100% opslag).' }
  }
  if (f > 50) {
    return { ok: false, error: 'Margefactor lijkt te hoog (max. 50).' }
  }

  // Bestaande item-rij?
  const { data: existing } = await supabase
    .from('margin_config')
    .select('id')
    .eq('scope', 'item')
    .eq('scope_value', code)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('margin_config')
      .update({
        margin_factor: f,
        description: `Item-marge ${code}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('margin_config').insert({
      scope: 'item',
      scope_value: code,
      margin_factor: f,
      description: `Item-marge ${code}`,
    })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/admin/catalogus')
  return { ok: true, marginFactor: f }
}
