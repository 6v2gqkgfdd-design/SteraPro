'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true } | { ok: false; error: string }

async function requireStaff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, error: 'Niet ingelogd.' as const }
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) return { supabase, error: 'Geen beheerder.' as const }
  return { supabase, error: null }
}

/** Zet één combinatie aan/uit voor de webshop. */
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

/** Zet meerdere combinaties tegelijk aan/uit (bulk-actie). */
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
  // In batches om payload-limieten te vermijden.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('shopify_offered_products')
      .upsert(rows.slice(i, i + 500), { onConflict: 'group_name' })
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/admin/catalogus')
  return { ok: true }
}
