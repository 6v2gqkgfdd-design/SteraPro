'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import SteraLogo from '@/components/stera-logo'

export default function PortalLoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/portal/auth/callback`,
      },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main className="flex min-h-screen flex-col bg-stera-cream text-stera-ink">
      <header className="border-b border-stera-line px-6 py-6 sm:px-10">
        <SteraLogo variant="default" href={null} />
      </header>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <p className="stera-eyebrow text-stera-green mb-3">Klantenportaal</p>
          <h1 className="stera-display mb-3 text-4xl">Inloggen</h1>

          {sent ? (
            <div className="rounded-xl border border-stera-green/30 bg-stera-green/5 p-5">
              <p className="font-semibold">Check je mailbox</p>
              <p className="mt-1 text-sm text-stera-ink-soft">
                We stuurden een inloglink naar <strong>{email}</strong>. Klik op
                de knop in die mail om in te loggen — geen wachtwoord nodig.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-8 text-sm leading-relaxed text-stera-ink-soft">
                Vul je e-mailadres in. We sturen je een inloglink — je hoeft
                geen wachtwoord te onthouden.
              </p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="stera-eyebrow text-stera-ink-soft mb-2 block">
                    E-mailadres
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full border border-stera-green/30 bg-white px-4 py-3 focus:border-stera-green focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="stera-cta stera-cta-primary w-full disabled:opacity-60"
                >
                  {loading ? 'Bezig…' : 'Stuur mij een inloglink →'}
                </button>
                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                ) : null}
              </form>
            </>
          )}
        </div>
      </div>
      <footer className="border-t border-stera-line px-6 py-6 text-xs text-stera-ink-soft sm:px-10">
        © {new Date().getFullYear()} Stera · Klantenportaal
      </footer>
    </main>
  )
}
