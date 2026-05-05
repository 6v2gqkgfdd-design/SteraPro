'use server'

import { createClient } from '@/lib/supabase/server'
import { sendEmail, escapeHtml } from '@/lib/email'

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
}

export type SubmitReportResult =
  | { ok: true }
  | { ok: false; error: string }

export async function submitPlantReport(
  input: SubmitReportInput
): Promise<SubmitReportResult> {
  if (!input.slug) {
    return { ok: false, error: 'Geen plant geselecteerd.' }
  }

  if (!ISSUE_LABELS[input.issueType]) {
    return { ok: false, error: 'Kies een geldig type melding.' }
  }

  const message = (input.message || '').trim()
  const reporterName = (input.reporterName || '').trim()
  const reporterEmail = (input.reporterEmail || '').trim()

  if (input.issueType === 'other' && !message) {
    return {
      ok: false,
      error: 'Beschrijf kort wat er aan de hand is.',
    }
  }

  if (reporterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)) {
    return { ok: false, error: 'E-mailadres lijkt ongeldig.' }
  }

  const supabase = await createClient()

  // 1) Plant ophalen via slug
  const { data: plant, error: plantError } = await supabase
    .from('plants')
    .select('id, nickname, species, reference_code, qr_slug, location_id')
    .eq('qr_slug', input.slug)
    .maybeSingle()

  if (plantError || !plant) {
    return {
      ok: false,
      error: 'Plant niet gevonden. Mogelijk is de QR-code intussen aangepast.',
    }
  }

  // 2) Melding wegschrijven
  const { error: insertError } = await supabase.from('plant_reports').insert([
    {
      plant_id: plant.id,
      issue_type: input.issueType,
      message: message || null,
      reporter_name: reporterName || null,
      reporter_email: reporterEmail || null,
    },
  ])

  if (insertError) {
    console.error('[plant_reports] insert failed', insertError)
    return {
      ok: false,
      error: 'Melding kon niet bewaard worden. Probeer het later opnieuw.',
    }
  }

  // 3) E-mail naar Stera (faalveilig — als Resend niet ingesteld is
  //    blijft de melding gewoon in de app staan).
  const opsTo = process.env.OPS_NOTIFY_EMAIL
  if (opsTo) {
    const plantLabel =
      plant.nickname || plant.species || plant.reference_code || 'Plant'
    const issueLabel = ISSUE_LABELS[input.issueType]

    const html = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #1c2924; max-width: 560px;">
        <p style="font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #426F52; margin: 0 0 8px;">
          Klantmelding via QR-code
        </p>
        <h1 style="font-size: 22px; margin: 0 0 12px;">${escapeHtml(plantLabel)}</h1>
        <p style="margin: 0 0 4px; font-weight: 600;">${escapeHtml(issueLabel)}</p>
        ${
          message
            ? `<p style="white-space: pre-wrap; margin: 8px 0 16px;">${escapeHtml(
                message
              )}</p>`
            : ''
        }
        <p style="font-size: 13px; color: #6a7470; margin: 16px 0 4px;">
          ${reporterName ? `Door: ${escapeHtml(reporterName)}<br/>` : ''}
          ${reporterEmail ? `Antwoord aan: ${escapeHtml(reporterEmail)}<br/>` : ''}
          Plant referentie: ${escapeHtml(plant.reference_code || plant.id)}
        </p>
      </div>
    `.trim()

    await sendEmail({
      to: opsTo,
      subject: `Stera · Klantmelding — ${plantLabel} (${issueLabel})`,
      html,
      replyTo: reporterEmail || undefined,
      tags: [{ name: 'type', value: 'plant_report' }],
    })
  }

  return { ok: true }
}
