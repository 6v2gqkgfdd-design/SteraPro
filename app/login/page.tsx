'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SteraLogo from '@/components/stera-logo'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink flex flex-col">
      <header className="px-6 py-6 sm:px-10 sm:py-8 border-b border-stera-line">
        <SteraLogo variant="default" />
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-12 sm:py-20">
        <div className="w-full max-w-md">
          <p className="stera-eyebrow text-stera-green mb-4">Plantbeheer</p>
          <h1 className="stera-display mb-3 text-4xl sm:text-5xl">Inloggen</h1>
          <p className="text-sm text-stera-ink-soft mb-10 leading-relaxed">
            Welkom terug bij Stera Pro. Beheer je planten, locaties en onderhoud.
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="stera-eyebrow text-stera-ink-soft mb-2 block">
                E-mailadres
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-stera-green/30 bg-white px-4 py-3 text-stera-ink focus:border-stera-green focus:outline-none focus:ring-0"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="stera-eyebrow text-stera-ink-soft mb-2 block">
                Wachtwoord
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-stera-green/30 bg-white px-4 py-3 text-stera-ink focus:border-stera-green focus:outline-none focus:ring-0"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="stera-cta stera-cta-primary w-full disabled:opacity-60"
            >
              {loading ? 'Bezig…' : 'Inloggen →'}
            </button>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
        </div>
      </div>

      <footer className="px-6 py-6 sm:px-10 text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}
