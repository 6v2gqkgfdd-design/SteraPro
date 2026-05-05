'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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
    <main className="min-h-screen bg-[#F5F0E8] text-stera-ink flex flex-col">
      <header className="px-6 py-6 sm:px-10 sm:py-8 border-b border-stera-line">
        <Link href="/" className="stera-wordmark text-stera-ink text-lg">
          Stéra<span className="text-stera-blue">Pro</span>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-12 sm:py-20">
        <div className="w-full max-w-md">
          <p className="stera-eyebrow text-stera-blue mb-4">Plantbeheer</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Inloggen
          </h1>
          <p className="text-sm text-stera-ink-soft mb-10 leading-relaxed">
            Welkom terug bij StéraPro. Beheer je planten, locaties en onderhoud.
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
                className="w-full border border-stera-blue/30 bg-white px-4 py-3 text-stera-ink focus:border-stera-blue focus:outline-none focus:ring-0"
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
                className="w-full border border-stera-blue/30 bg-white px-4 py-3 text-stera-ink focus:border-stera-blue focus:outline-none focus:ring-0"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="stera-cta w-full bg-stera-blue px-4 py-4 text-sm text-white transition-colors hover:bg-[#0010C0] disabled:opacity-60"
            >
              {loading ? 'Bezig…' : 'Inloggen →'}
            </button>

            {error && (
              <p className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>

          <p className="mt-8 text-sm text-stera-ink-soft">
            Nog geen account?{' '}
            <Link
              href="/signup"
              className="font-semibold text-stera-ink underline underline-offset-4 hover:text-stera-blue"
            >
              Account aanmaken
            </Link>
          </p>
        </div>
      </div>

      <footer className="px-6 py-6 sm:px-10 text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}
