'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import SteraLogo from '@/components/stera-logo'

const REG_FIELDS: Array<{ key: string; label: string; type?: string; required?: boolean; half?: boolean }> = [
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

export const REG_STORAGE_KEY = 'stera_portal_reg'

export default function PortalEntryPage() {
  const supabase = createClient()
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [email, setEmail] = useState('')
  const [form, setForm] = useState<Record<string, string>>({ country: 'België' })
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendLink(targetEmail: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail.trim(),
      options: { emailRedirectTo: `${window.location.origin}/portal/auth/callback` },
    })
    if (error) throw new Error(error.message)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name?.trim() || !form.last_name?.trim() || !form.company_name?.trim() || !email.trim()) {
      setError('Vul minstens je naam, bedrijfsnaam en e-mailadres in.')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Bewaar de gegevens lokaal; na de e-mailbevestiging ronden we de
      // registratie automatisch af.
      window.localStorage.setItem(REG_STORAGE_KEY, JSON.stringify({ ...form, email: email.trim() }))
      await sendLink(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await sendLink(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-stera-cream text-stera-ink">
      <header className="border-b border-stera-line px-6 py-6 sm:px-10">
        <SteraLogo variant="default" href={null} />
      </header>
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-2xl">
          <p className="stera-eyebrow text-stera-green mb-3">Klantenportaal</p>

          {sent ? (
            <div className="rounded-xl border border-stera-green/30 bg-stera-green/5 p-6">
              <h1 className="text-2xl font-bold">Check je mailbox</h1>
              <p className="mt-2 text-sm text-stera-ink-soft">
                We stuurden een bevestigingslink naar <strong>{email}</strong>.
                Klik erop om {mode === 'register' ? 'je registratie af te ronden' : 'in te loggen'} —
                geen wachtwoord nodig.
              </p>
            </div>
          ) : mode === 'register' ? (
            <>
              <h1 className="stera-display mb-2 text-3xl sm:text-4xl">Registreer je bedrijf</h1>
              <p className="mb-6 text-sm leading-relaxed text-stera-ink-soft">
                Vul je gegevens in om toegang te vragen tot het portaal. Je
                bevestigt met een link in je mailbox — daarna bekijkt Stera je
                aanvraag.
              </p>
              <form onSubmit={handleRegister} className="rounded-xl border border-stera-line bg-white p-5">
                <div className="mb-3">
                  <label className="stera-eyebrow text-stera-ink-soft mb-1 block">E-mailadres *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full rounded-lg border border-stera-line bg-white p-3"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {REG_FIELDS.map((f) => (
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
                <button type="submit" disabled={loading} className="stera-cta stera-cta-primary mt-5 w-full disabled:opacity-60">
                  {loading ? 'Bezig…' : 'Registreren →'}
                </button>
              </form>
              <p className="mt-4 text-center text-sm text-stera-ink-soft">
                Al een account?{' '}
                <button type="button" onClick={() => { setMode('login'); setError('') }} className="text-stera-green underline-offset-4 hover:underline">
                  Log in met je e-mail
                </button>
              </p>
            </>
          ) : (
            <div className="mx-auto max-w-md">
              <h1 className="stera-display mb-2 text-3xl sm:text-4xl">Inloggen</h1>
              <p className="mb-6 text-sm leading-relaxed text-stera-ink-soft">
                Vul je e-mailadres in; we sturen je een inloglink.
              </p>
              <form onSubmit={handleLogin} className="space-y-4 rounded-xl border border-stera-line bg-white p-5">
                <div>
                  <label className="stera-eyebrow text-stera-ink-soft mb-1 block">E-mailadres</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full rounded-lg border border-stera-line bg-white p-3"
                  />
                </div>
                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                ) : null}
                <button type="submit" disabled={loading} className="stera-cta stera-cta-primary w-full disabled:opacity-60">
                  {loading ? 'Bezig…' : 'Stuur inloglink →'}
                </button>
              </form>
              <p className="mt-4 text-center text-sm text-stera-ink-soft">
                Nog geen account?{' '}
                <button type="button" onClick={() => { setMode('register'); setError('') }} className="text-stera-green underline-offset-4 hover:underline">
                  Registreer je bedrijf
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
      <footer className="border-t border-stera-line px-6 py-6 text-xs text-stera-ink-soft sm:px-10">
        © {new Date().getFullYear()} Stera · Klantenportaal
      </footer>
    </main>
  )
}
