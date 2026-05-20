'use server'

import { createClient } from '@/lib/supabase/server'

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

  // 1) Plant ophalen via de publieke RPC — werkt ook zonder login,
  //    zodat een klant een melding kan insturen.
  const { data: plant, error: plantError } = await supabase.rpc(
    'get_public_plant',
    { _slug: input.slug }
  )

  if (plantError || !plant || typeof plant.id !== 'string') {
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
      photo_path: input.photoPath || null,
      photo_url: input.photoUrl || null,
    },
  ])

  if (insertError) {
    console.error('[plant_reports] insert failed', insertError)
    return {
      ok: false,
      error: 'Melding kon niet bewaard worden. Probeer het later opnieuw.',
    }
  }

  // Geen e-mail — meldingen leven enkel in de app, anders loopt de
  // Stera-mailbox vol. Jelle ziet ze op de Home en op de plantfiche.

  return { ok: true }
}
