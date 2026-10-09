import { createClient } from '@/lib/supabase/server'
import { submitPlantReport, type ReportIssueType } from '@/app/p/[slug]/actions'
import { savePlantNote } from '@/app/portal/planten/[id]/actions'
import { createPlantRequest } from '@/app/portal/aanvraag/actions'
import { hasDemoPortalSession } from '@/lib/portal-demo'
import { demoEnabled } from '@/lib/demo-session'
import { demoPlantById, isDemoSlug } from '@/lib/portal-demo-data'
import { safeBack, withParam } from '@/lib/msp-document'

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: path, 'Cache-Control': 'no-store' },
  })
}

export async function postMelding(form: FormData): Promise<Response> {
  const slug = String(form.get('slug') || '').slice(0, 80)
  const back = safeBack(form.get('back'), slug ? `/p/${slug}/report` : '/p')
  const issue = String(form.get('issue') || '') as ReportIssueType
  const file = form.get('photo')
  const hasPhoto = file instanceof File && file.size > 0
  if (hasPhoto && file.size > 4_000_000) {
    return redirectTo(withParam(back, 'fout', 'De foto is te groot. Kies een foto onder 4 MB.'))
  }

  let photoUrl: string | null = null
  let photoPath: string | null = null
  let photoSkipped = false
  if (hasPhoto && file instanceof File) {
    if (demoEnabled() && isDemoSlug(slug)) {
      photoSkipped = true
    } else {
      try {
        const supabase = await createClient()
        const bytes = Buffer.from(await file.arrayBuffer())
        const path = `reports/${slug}/${Date.now()}.jpg`
        const { error } = await supabase.storage.from('plant-photos').upload(path, bytes, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        })
        if (error) photoSkipped = true
        else {
          photoPath = path
          photoUrl = supabase.storage.from('plant-photos').getPublicUrl(path).data.publicUrl
        }
      } catch {
        photoSkipped = true
      }
    }
  }

  const result = await submitPlantReport({
    slug,
    issueType: issue,
    message: String(form.get('message') || ''),
    reporterName: String(form.get('name') || ''),
    reporterEmail: String(form.get('email') || ''),
    honeypot: String(form.get('website') || ''),
    photoUrl,
    photoPath,
    photoSkipped,
  })
  if (!result.ok) return redirectTo(withParam(back, 'fout', result.error))
  return redirectTo(withParam(back, 'sent', '1'))
}

export async function postNotitie(form: FormData): Promise<Response> {
  const plantId = String(form.get('plant') || '')
  const back = safeBack(form.get('back'), '/portal/planten')
  const note = String(form.get('note') || '')
  const demoFlag = form.get('demo') === '1'
  if (demoFlag) {
    if (!(demoEnabled() && demoPlantById(plantId))) {
      return redirectTo(withParam(back, 'fout', 'Plant niet gevonden in het voorbeeld.'))
    }
    if (await hasDemoPortalSession()) {
      const result = await savePlantNote(plantId, note)
      if (!result.ok) return redirectTo(withParam(back, 'fout', result.error))
      return redirectTo(withParam(back, 'notitie', '1'))
    }
    return redirectTo(withParam(back, 'notitie', 'voorbeeld'))
  }
  const result = await savePlantNote(plantId, note)
  if (!result.ok) return redirectTo(withParam(back, 'fout', result.error))
  return redirectTo(withParam(back, 'notitie', '1'))
}

export async function postAanvraag(form: FormData): Promise<Response> {
  const back = safeBack(form.get('back'), '/portal/aanvraag')
  const input = {
    species: String(form.get('species') || ''),
    quantity: String(form.get('quantity') || ''),
    locationNote: String(form.get('location') || ''),
    message: String(form.get('message') || ''),
  }
  if (form.get('demo') === '1') {
    if (!demoEnabled()) return redirectTo(withParam(back, 'fout', 'Het voorbeeld staat uit.'))
    if (await hasDemoPortalSession()) {
      const result = await createPlantRequest(input)
      if (!result.ok) return redirectTo(withParam(back, 'fout', result.error))
      return redirectTo(withParam(back, 'aanvraag', '1'))
    }
    if (input.message.trim().length < 3) {
      return redirectTo(withParam(back, 'fout', 'Schrijf een korte toelichting (minstens 3 tekens).'))
    }
    return redirectTo(withParam(back, 'aanvraag', 'voorbeeld'))
  }
  const result = await createPlantRequest(input)
  if (!result.ok) return redirectTo(withParam(back, 'fout', result.error))
  return redirectTo(withParam(back, 'aanvraag', '1'))
}
