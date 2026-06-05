'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SteraLogo from '@/components/stera-logo'

const REG_STORAGE_KEY = 'stera_portal_reg'

const FIELDS: Array<{ key: string; label: string; type?: string; required?: boolean; half?: boolean }> = [
  { key: 'first_name', label: 'Voornaam', required: true, half: true },
  { key: 'last_name', label: 'Achternaam', required: true, half: true },
  { key: 'phone', label: 'Telefoon', type: 'tel', half: true },
  { key: 'role', label: 'Functie', half: true },
  { key: 'company_name', label: 'Bedrijfsnaam', required: true },
  { key: 'vat_number', label: 'BTW-nummer', half: true },
  { key: 'billing_email', label: 'Facturatie-e-mail', type: 'email', half: true },
  { key: 'street', label: 'Straat', half: true },
  { key: 'house_number', label: 'Nummer', half: true },
  { key: 'postal_code', label: 'Postcode', half: true },
  { key: 'city', label: 'Gemeente', half: true },
  { key: 'country', label: 'Land', half: true },
]

export default function RegisterPage() {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [form, setForm] = useState<Record<string, string>>({ country: 'België' })
  const [phase, setPhase] = useState<'init' | 'form' | 'finalizing'>('init')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      if (!data.user) {
        router.replace('/portal/login')
        return
      }
      setEmail(data.user.email ?? '')

      // Gegevens uit de registratie (bewaard vóór de e-mailbevestiging)?
      // Dan ronden we automatisch af.
      const stored = window.localStorage.getItem(REG_STORAGE_KEY)
      if (stored) {
        setPhase('finalizing')
        try {
          const parsed = JSON.parse(stored)
          const { error } = await supabase.rpc('request_portal_access', { _data: parsed })
          window.localStorage.removeItem(REG_STORAGE_KEY)
          if (error) throw new Error(error.message)
          router.replace('/portal')
          router.refresh()
          return
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Registratie afronden mislukt.')
          setForm((p) => ({ ...p, ...safeParse(stored) }))
          setPhase('form')
          return
        }
      }
      setPhase('form')
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name?.trim() || !form.last_name?.trim() || !form.company_name?.trim()) {
      setError('Vul minstens je naam en bedrijfsnaam in.')
      return
    }
    setSaving(true)
    setError('')
    const { error } = await supabase.rpc('request_portal_access', { _data: form })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push('/portal')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink">
      <header className="border-b border-stera-line px-5 py-4 sm:px-10">
        <SteraLogo variant="default" href={null} />
      </header>
      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-10">
        {phase === 'finalizing' ? (
          <p className="text-sm text-stera-ink-soft">Registratie afronden…</p>
        ) : phase === 'init' ? (
          <p className="text-sm text-stera-ink-soft">Laden…</p>
        ) : (
          <>
            <p className="stera-eyebrow text-stera-green mb-2">Registratie</p>
            <h1 className="text-2xl font-bold sm:text-3xl">Vul je gegevens aan</h1>
            <p className="mt-2 text-sm text-stera-ink-soft">
              Stera Pro bekijkt je aanvraag en activeert je toegang.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-stera-line bg-white p-5">
              <div className="mb-4">
                <label className="stera-eyebrow text-stera-ink-soft mb-1 block">E-mailadres</label>
                <input type="email" value={email} readOnly className="w-full rounded-lg border border-stera-line bg-stera-cream/50 p-3 text-stera-ink-soft" />
              </div>
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
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      required={f.required}
                      className="w-full rounded-lg border border-stera-line bg-white p-3"
                    />
                  </div>
                ))}
              </div>
              {error ? (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}
              <button type="submit" disabled={saving} className="stera-cta stera-cta-primary mt-5 w-full disabled:opacity-60 sm:w-auto">
                {saving ? 'Versturen…' : 'Aanvraag versturen →'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}

function safeParse(s: string): Record<string, string> {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
