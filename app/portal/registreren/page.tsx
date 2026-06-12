'use client'

/**
 * Publieke B2B-aanvraag (wachtwoordloos).
 *
 * Geen Supabase-account meer nodig: de bezoeker dient een aanvraag in
 * met verplicht BTW-nummer. De API (/api/portal/apply) valideert het
 * nummer live tegen VIES en zet de aanvraag klaar voor goedkeuring op
 * /portal-aanvragen. Inloggen gebeurt daarna via de Shopify-webshop
 * (e-mailcode, geen wachtwoord).
 */

import { useState } from 'react'

const FIELDS: Array<{
  key: string
  label: string
  type?: string
  required?: boolean
  half?: boolean
  placeholder?: string
}> = [
  { key: 'first_name', label: 'Voornaam', required: true, half: true },
  { key: 'last_name', label: 'Achternaam', required: true, half: true },
  { key: 'email', label: 'E-mailadres', type: 'email', required: true, half: true },
  { key: 'phone', label: 'Telefoon', type: 'tel', half: true },
  { key: 'company_name', label: 'Bedrijfsnaam', required: true },
  { key: 'vat_number', label: 'BTW-nummer', required: true, half: true, placeholder: 'BE0123456789' },
  { key: 'billing_email', label: 'Facturatie-e-mail', type: 'email', half: true },
  { key: 'street', label: 'Straat', half: true },
  { key: 'house_number', label: 'Nummer', half: true },
  { key: 'postal_code', label: 'Postcode', half: true },
  { key: 'city', label: 'Gemeente', half: true },
  { key: 'country', label: 'Land', half: true },
  { key: 'remark', label: 'Opmerking', half: true },
]

export default function RegisterPage() {
  const [form, setForm] = useState<Record<string, string>>({ country: 'België' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/portal/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = (await res.json()) as { ok: boolean; error?: string; message?: string }
      if (!res.ok || !j.ok) {
        setError(j.error || 'Er ging iets mis. Probeer later opnieuw.')
        return
      }
      setDone(
        j.message ||
          'Bedankt! We hebben je aanvraag goed ontvangen. Stera Pro controleert je gegevens en je krijgt een e-mail zodra je toegang actief is.'
      )
    } catch {
      setError('Er ging iets mis. Probeer later opnieuw.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink">
      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-10">
        <p className="stera-eyebrow text-stera-green mb-2">Klantenportaal</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Registreer je bedrijf</h1>
        <p className="mt-2 text-sm text-stera-ink-soft">
          Stera Pro werkt uitsluitend voor bedrijven: een geldig BTW-nummer is
          vereist. Na goedkeuring log je in via de webshop met een
          e-mailcode — geen wachtwoord nodig.
        </p>

        {done ? (
          <div className="mt-6 rounded-xl border border-stera-line bg-white p-6">
            <p className="text-base font-semibold text-stera-green">Aanvraag verstuurd</p>
            <p className="mt-2 text-sm text-stera-ink-soft">{done}</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6 rounded-xl border border-stera-line bg-white p-5"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.half ? '' : 'sm:col-span-2'}>
                  <label className="stera-eyebrow text-stera-ink-soft mb-1 block">
                    {f.label}
                    {f.required ? ' *' : ''}
                  </label>
                  <input
                    type={f.type ?? 'text'}
                    value={form[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, [f.key]: e.target.value }))
                    }
                    required={f.required}
                    className="w-full rounded-lg border border-stera-line bg-white p-3"
                  />
                </div>
              ))}
              <input
                type="text"
                name="website"
                value={form.website ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />
            </div>
            <p className="mt-3 text-xs text-stera-ink-soft">
              We controleren je BTW-nummer automatisch in de Europese
              BTW-databank (VIES).
            </p>
            {error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="stera-cta stera-cta-primary mt-5 w-full disabled:opacity-60 sm:w-auto"
            >
              {saving ? 'Versturen…' : 'Aanvraag versturen →'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
