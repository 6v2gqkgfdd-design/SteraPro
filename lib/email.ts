/**
 * E-mail-helper rond Resend (https://resend.com).
 *
 * Eén plek waar al onze uitgaande mail door loopt. Twee primaire
 * gebruiken:
 *   - Klantmeldingen vanaf de publieke QR-pagina → naar jelle@stera.be
 *   - Klantrapport van een afgesloten onderhoudsbeurt → naar de klant
 *
 * Vereiste env-vars (ingesteld in Vercel én optioneel in .env.local):
 *   RESEND_API_KEY     Resend API-key (begint met re_…)
 *   RESEND_FROM_EMAIL  Standaard afzender, bv. "Stera <noreply@stera.be>"
 *   OPS_NOTIFY_EMAIL   Adres dat klantmeldingen ontvangt, bv. jelle@stera.be
 *
 * Faalveilig: als de key ontbreekt of Resend down is, geven we een
 * Result terug i.p.v. te crashen. De caller beslist of dat een probleem
 * is (bv. de UI laat zien "kon mail niet versturen" maar slaat de
 * melding wel op in de database).
 */

export type EmailRecipient = string | { email: string; name?: string }

export type SendEmailInput = {
  to: EmailRecipient | EmailRecipient[]
  subject: string
  html: string
  text?: string
  replyTo?: EmailRecipient
  from?: EmailRecipient
  /** Optioneel: tags voor filtering in de Resend dashboard. */
  tags?: { name: string; value: string }[]
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean }

function formatRecipient(r: EmailRecipient): string {
  if (typeof r === 'string') return r
  return r.name ? `${r.name} <${r.email}>` : r.email
}

function formatRecipients(
  r: EmailRecipient | EmailRecipient[]
): string | string[] {
  if (Array.isArray(r)) return r.map(formatRecipient)
  return formatRecipient(r)
}

const DEFAULT_FROM = 'Stera <onboarding@resend.dev>'

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEnv = process.env.RESEND_FROM_EMAIL

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY ontbreekt — mail niet verstuurd.')
    return {
      ok: false,
      error: 'RESEND_API_KEY ontbreekt in env',
      skipped: true,
    }
  }

  const from = input.from
    ? formatRecipient(input.from)
    : (fromEnv && fromEnv.trim()) || DEFAULT_FROM

  const body: Record<string, unknown> = {
    from,
    to: formatRecipients(input.to),
    subject: input.subject,
    html: input.html,
  }

  if (input.text) body.text = input.text
  if (input.replyTo) body.reply_to = formatRecipient(input.replyTo)
  if (input.tags && input.tags.length) body.tags = input.tags

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // Resend API timeout-bescherming: een afspraak afronden mag niet
      // wachten op een trage SMTP-relay.
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[email] Resend rejected the message', res.status, text)
      return {
        ok: false,
        error: `Resend ${res.status}: ${text || 'onbekende fout'}`,
      }
    }

    const data: any = await res.json().catch(() => ({}))
    const id = data?.id ?? data?.data?.id ?? ''
    return { ok: true, id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[email] sendEmail crash', message)
    return { ok: false, error: message }
  }
}

/**
 * Wikkel HTML-onveilige tekst (klantnotities, vrije velden) in een
 * minimale escape zodat we ze veilig in onze e-mailtemplates kunnen
 * gebruiken.
 */
export function escapeHtml(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
