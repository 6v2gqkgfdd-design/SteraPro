'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { hasDemoPortalSession, saveDemoPlantNote } from '@/lib/portal-demo'
import { demoPlantById } from '@/lib/portal-demo-data'

type Result = { ok: true } | { ok: false; error: string }

export async function savePlantNote(plantId: string, note: string): Promise<Result> {
  const text = note.trim().slice(0, 2000)
  if (await hasDemoPortalSession()) {
    if (!demoPlantById(plantId)) return { ok: false, error: 'Plant niet gevonden in het voorbeeld.' }
    await saveDemoPlantNote(plantId, text)
    revalidatePath(`/portal/planten/${plantId}`)
    return { ok: true }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Log eerst in.' }

  const { error } = await supabase.rpc('portal_set_my_plant_note', {
    _plant_id: plantId,
    _note: text,
  })
  if (error) {
    if (error.code === 'PGRST202' || /schema cache/i.test(error.message || '')) {
      return { ok: false, error: 'Notities zijn op deze omgeving nog niet geactiveerd.' }
    }
    return { ok: false, error: 'Notitie opslaan mislukt.' }
  }
  revalidatePath(`/portal/planten/${plantId}`)
  return { ok: true }
}
