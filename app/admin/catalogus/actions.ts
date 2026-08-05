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

/** Zet één combinatie-groep aan/uit (legacy group_name model). */
export async function setOffered(groupName: string, offered: boolean): Promise<Result> {
  const { supabase, error: authErr } = await requireStaff()
  if (authErr) return { ok: false, error: authErr }
  const { error } = await supabase
    .from('shopify_offered_products')
    .upsert(
      { group_name: groupName, offered, updated_at: new Date().toISOString() },
      { onConflict: 'group_name' }
    )
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/catalogus')
  return { ok: true }
}

/** Zet meerdere combinatie-groepen tegelijk (legacy). */
export async function setOfferedBulk(
  groupNames: string[],
  offered: boolean
): Promise<Result> {
  const { supabase, error: authErr } = await requireStaff()
  if (authErr) return { ok: false, error: authErr }
  if (groupNames.length === 0) return { ok: true }
  const now = new Date().toISOString()
  const rows = groupNames.map((n) => ({
    group_name: n,
    offered,
    updated_at: now,
  }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('shopify_offered_products')
      .upsert(rows.slice(i, i + 500), { onConflict: 'group_name' })
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/admin/catalogus')
  return { ok: true }
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
