'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { escapeHtml, opsNotifyEmail, sendEmail } from '@/lib/email'
import { hasDemoPortalSession, saveDemoReport } from '@/lib/portal-demo'
import { demoEnabled } from '@/lib/demo-session'
import { demoPlantBySlug, isDemoSlug } from '@/lib/portal-demo-data'
import { allowReport } from '@/lib/report-rate-limit'

export type ReportIssueType =
  | 'replace'
  | 'sick'
  | 'damaged'
  | 'pest'
  | 'other'

const ISSUE_LABELS: Record<ReportIssueType, string> = {
  replace: 'Plant moet vervangen worden',
  sick: 'Plant lijkt ziek',
  damaged: 'Plant is beschadigd',
  pest: 'Ongedierte / aantasting',
  other: 'Andere opmerking',
}

export type SubmitReportInput = {
  slug: string
  issueType: ReportIssueType
  message: string
  reporterName?: string
  reporterEmail?: string
  photoPath?: string | null
  photoUrl?: string | null
  honeypot?: string
  photoSkipped?: boolean
}

export type SubmitReportResult =
  | { ok: true; notice?: string }
  | { ok: false; error: string }

export async function submitPlantReport(
  input: SubmitReportInput
): Promise<SubmitReportResult> {
  if ((input.honeypot || '').trim()) {
    return { ok: true, notice: 'Bedankt, we hebben je melding.' }
  }

  if (!input.slug) {
    return { ok: false, error: 'Geen plant geselecteerd.' }
  }

  if (!ISSUE_LABELS[input.issueType]) {
    return { ok: false, error: 'Kies een geldig type melding.' }
  }

  const message = (input.message || '').trim().slice(0, 2000)
  const reporterName = (input.reporterName || '').trim().slice(0, 120)
  const reporterEmail = (input.reporterEmail || '').trim().slice(0, 200)

  if (input.issueType === 'other' && !message) {
    return {
      ok: false,
      error: 'Beschrijf kort wat er aan de hand is.',
    }
  }

  if ((message.match(/https?:\/\//gi) || []).length > 2) {
    return { ok: false, error: 'De toelichting bevat te veel links.' }
  }

  if (reporterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)) {
    return { ok: false, error: 'E-mailadres lijkt ongeldig.' }
  }

  const headerList = await headers()
  const ip = (headerList.get('x-forwarded-for') || 'local').split(',')[0]?.trim() || 'local'
  if (!allowReport(ip)) {
    return { ok: false, error: 'Te veel meldingen kort na elkaar. Probeer het later opnieuw.' }
  }

  const label = ISSUE_LABELS[input.issueType]
  const photoLine = input.photoSkipped
    ? 'Foto niet bewaard: de preview schrijft niets naar de fotobucket.'
    : input.photoUrl
      ? `Foto: ${input.photoUrl}`
      : 'Geen foto'

  if (demoEnabled() && isDemoSlug(input.slug)) {
    const plant = demoPlantBySlug(input.slug)
    if (!plant || !(await hasDemoPortalSession())) {
      await notifyOps({
        title: plant?.nickname || input.slug,
        species: plant?.species || '',
        label,
        message,
        reporterName,
        reporterEmail,
        photoLine,
        where: 'voorbeeld-QR, zonder demosessie',
      })
      if (!plant) return { ok: false, error: 'Plant niet gevonden.' }
      return {
        ok: true,
        notice:
          'Bedankt. Op deze preview is de melding gelogd en niet als ticket in de productiedatabase gezet.',
      }
    }
    await saveDemoReport({
      id: crypto.randomUUID(),
      plant_id: plant.id,
      slug: plant.qr_slug,
      issue_type: input.issueType,
      message: message || null,
      reporter_name: reporterName || null,
      status: 'new',
      created_at: new Date().toISOString(),
      photo_note: input.photoSkipped ? 'Foto niet bewaard in de preview.' : null,
    })
    await notifyOps({
      title: plant.nickname,
      species: plant.species,
      label,
      message,
      reporterName,
      reporterEmail,
      photoLine,
      where: 'Demo Kantoor',
    })
    return {
      ok: true,
      notice:
        'Voorbeeldmelding bewaard in Demo Kantoor. Er is geen echte e-mail verstuurd; de tekst staat in de preview-log.',
    }
  }

  const supabase = await createClient()
  const { data: plant, error: plantError } = await supabase.rpc('get_public_plant', {
    _slug: input.slug,
  })

  if (plantError || !plant || typeof plant.id !== 'string') {
    return {
      ok: false,
      error: 'Plant niet gevonden. Mogelijk is de QR-code intussen aangepast.',
    }
  }

  const { error: insertError } = await supabase.from('plant_reports').insert([
    {
      plant_id: plant.id,
      issue_type: input.issueType,
      message: message || null,
      reporter_name: reporterName || null,
      reporter_email: reporterEmail || null,
      photo_path: input.photoPath || null,
      photo_url: input.photoUrl || null,
    },
  ])

  if (insertError) {
    console.error('[plant_reports] insert failed', insertError.code)
    return {
      ok: false,
      error: 'Melding kon niet bewaard worden. Probeer het later opnieuw.',
    }
  }

  await notifyOps({
    title: String(plant.nickname || plant.species || input.slug),
    species: String(plant.species || ''),
    label,
    message,
    reporterName,
    reporterEmail,
    photoLine,
    where: 'QR',
  })

  return { ok: true }
}

async function notifyOps(input: {
  title: string
  species: string
  label: string
  message: string
  reporterName: string
  reporterEmail: string
  photoLine: string
  where: string
}) {
  const to = opsNotifyEmail()
  const subject = `Plantmelding: ${input.title}`
  const text = [
    `Melding (${input.where})`,
    `Plant: ${input.title}`,
    input.species ? `Soort: ${input.species}` : '',
    `Type: ${input.label}`,
    input.message ? `Toelichting: ${input.message}` : '',
    input.reporterName ? `Naam: ${input.reporterName}` : '',
    input.reporterEmail ? `E-mail: ${input.reporterEmail}` : '',
    input.photoLine,
  ]
    .filter(Boolean)
    .join('\n')

  await sendEmail({
    to,
    subject,
    text,
    html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
    tags: [{ name: 'kind', value: 'plant-report' }],
  })
}
