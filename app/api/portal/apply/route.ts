/**
 * Publieke B2B-aanvraag (wachtwoordloos).
 *
 * Vervangt de oude registratie-met-wachtwoord: een bezoeker dient een
 * aanvraag in mét verplicht BTW-nummer. We valideren het nummer live
 * tegen VIES (de officiële EU-databank). Geldig → rij in portal_contacts
 * (status 'pending') + notificatiemail naar OPS_NOTIFY_EMAIL.
 *
 * Goedkeuren gebeurt daarna handmatig op /portal-aanvragen, en in
 * Shopify (bedrijf aanmaken + contact uitnodigen) zodra B2B live is.
 *
 * Faalveilig: als VIES zelf onbereikbaar is (gebeurt regelmatig),
 * blokkeren we de aanvraag niet — we markeren vat_checked: false zodat
 * de controle handmatig kan gebeuren bij goedkeuring.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

const REQUIRED = ['first_name', 'last_name', 'email', 'company_name', 'vat_number'] as const

const FIELD_KEYS = [
  'first_name', 'last_name', 'email', 'phone', 'role', 'company_name',
  'vat_number', 'billing_email', 'street', 'house_number', 'postal_code',
  'city', 'country', 'remark',
] as const

type ViesResult =
  | { checked: true; valid: boolean; name: string | null }
  | { checked: false }

/** Normaliseert "be 0123.456.789" → "BE0123456789". */
function normalizeVat(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

async function viesOnce(countryCode: string, vatNumber: string): Promise<ViesResult> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(
      'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SteraPro/1.0 (jelle@sterapro.be)',
        },
        body: JSON.stringify({ countryCode, vatNumber }),
        signal: ctrl.signal,
        cache: 'no-store',
      }
    )
    clearTimeout(timer)
    if (!res.ok) return { checked: false }
    const j = (await res.json()) as { valid?: boolean; name?: string }
    if (typeof j.valid !== 'boolean') return { checked: false }
    return {
      checked: true,
      valid: j.valid,
      name: j.name && j.name !== '---' ? j.name : null,
    }
  } catch {
    return { checked: false }
  }
}

async function checkVies(vat: string): Promise<ViesResult> {
  const countryCode = vat.slice(0, 2)
  const vatNumber = vat.slice(2)
  const first = await viesOnce(countryCode, vatNumber)
  if (first.checked) return first
  // VIES is geregeld kort onbereikbaar of throttelt — één keer opnieuw.
  await new Promise((r) => setTimeout(r, 1200))
  return viesOnce(countryCode, vatNumber)
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  // Honeypot: bots vullen het verborgen veld "website" in → stil ok.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true })
  }

  const data: Record<string, string> = {}
  for (const k of FIELD_KEYS) {
    const v = body[k]
    if (typeof v === 'string' && v.trim()) data[k] = v.trim().slice(0, 300)
  }

  for (const k of REQUIRED) {
    if (!data[k]) {
      return NextResponse.json(
        { ok: false, error: 'Vul alle verplichte velden in (incl. BTW-nummer).' },
        { status: 400 }
      )
    }
  }

  const email = data.email.toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Ongeldig e-mailadres.' }, { status: 400 })
  }

  const vat = normalizeVat(data.vat_number)
  if (!/^[A-Z]{2}[0-9A-Z]{2,12}$/.test(vat)) {
    return NextResponse.json(
      { ok: false, error: 'Dat lijkt geen geldig BTW-nummer (bv. BE0123456789).' },
      { status: 400 }
    )
  }
  data.vat_number = vat

  const vies = await checkVies(vat)
  if (vies.checked && !vies.valid) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Dit BTW-nummer is niet gekend in de Europese BTW-databank (VIES). Controleer het nummer en probeer opnieuw.',
      },
      { status: 400 }
    )
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Dubbele aanvraag? Vriendelijk melden i.p.v. tweede rij.
  const { data: existing } = await admin
    .from('portal_contacts')
    .select('id, status')
    .eq('email', email)
    .in('status', ['pending', 'approved'])
    .limit(1)
  if (existing && existing.length > 0) {
    const status = (existing[0] as { status: string }).status
    return NextResponse.json({
      ok: true,
      duplicate: true,
      message:
        status === 'approved'
          ? 'Er bestaat al een actief account voor dit e-mailadres. Log in via de webshop.'
          : 'We hebben je aanvraag al ontvangen — je hoort snel van ons.',
    })
  }

  const { error: insertErr } = await admin.from('portal_contacts').insert({
    email,
    status: 'pending',
    name: [data.first_name, data.last_name].filter(Boolean).join(' '),
    requested_company: data.company_name,
    request_data: {
      ...data,
      email,
      vat_checked: vies.checked,
      vat_valid: vies.checked ? true : null,
      vat_name: vies.checked ? vies.name : null,
    },
  })
  if (insertErr) {
    return NextResponse.json(
      { ok: false, error: 'Aanvraag opslaan mislukt. Probeer later opnieuw.' },
      { status: 500 }
    )
  }

  const notify = process.env.OPS_NOTIFY_EMAIL || 'jelle@sterapro.be'
  await sendEmail({
    to: notify,
    subject: `Nieuwe B2B-aanvraag: ${data.company_name}`,
    html: `
      <h2>Nieuwe portaal-aanvraag</h2>
      <p><strong>${data.company_name}</strong> (${vat}${
        vies.checked ? (vies.name ? ` — VIES: ${vies.name}` : ' — VIES: geldig') : ' — VIES niet bereikbaar, handmatig checken'
      })</p>
      <p>${data.first_name} ${data.last_name} · ${email}${data.phone ? ` · ${data.phone}` : ''}</p>
      ${data.street ? `<p>${data.street} ${data.house_number ?? ''}, ${data.postal_code ?? ''} ${data.city ?? ''} ${data.country ?? ''}</p>` : ''}
      ${data.remark ? `<p>Opmerking: ${data.remark}</p>` : ''}
      <p><a href="https://app.sterapro.be/portal-aanvragen">Open de aanvragenlijst</a></p>
    `,
    tags: [{ name: 'type', value: 'b2b-aanvraag' }],
  })

  return NextResponse.json({ ok: true })
}
