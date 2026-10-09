'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import WhyAccount from '@/components/why-account'

export default function PortalLoginForm({
  initialEmail = '',
  notice = null,
  demoAvailable = false,
}: {
  initialEmail?: string
  notice?: 'pending' | null
  demoAvailable?: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (signError) {
      setError(signError.message)
      return
    }
    router.push('/portal')
    router.refresh()
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Vul je e-mailadres in.')
      return
    }
    setLoading(true)
    setError('')
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/portal/auth/callback` },
    })
    setLoading(false)
    if (otpError) {
      setError(otpError.message)
      return
    }
    setMagicSent(true)
  }

  return (
    <main className="msp-root">
      <div className="msp-login">
        <WhyAccount />
        <section>
          <h1 className="msp-title">Inloggen</h1>
          {demoAvailable ? (
            <p className="msp-banner">
              Dit is een voorbeeld. Open <a href="/portal/demo">Demo Kantoor</a> zonder e-mail. Een
              inloglink hieronder verstuurt wel een echte mail.
            </p>
          ) : null}
          {notice === 'pending' ? (
            <p className="msp-banner">
              Je aanvraag voor dit e-mailadres is in behandeling. De koppeling vanuit de webshop werkt
              zodra we je toegang hebben goedgekeurd.
            </p>
          ) : null}
          <p className="msp-lead">Log in met je e-mailadres en wachtwoord, of vraag een inloglink.</p>
          <form onSubmit={handleLogin}>
            <label className="msp-label" htmlFor="portal-email">
              E-mailadres
            </label>
            <input
              id="portal-email"
              className="msp-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <label className="msp-label" htmlFor="portal-password">
              Wachtwoord
            </label>
            <input
              id="portal-password"
              className="msp-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {error ? <p className="msp-note">{error}</p> : null}
            <p style={{ marginTop: 16 }}>
              <button type="submit" disabled={loading} className="msp-btn msp-btn-block">
                {loading ? 'Bezig…' : 'Inloggen'}
              </button>
            </p>
          </form>
          {magicSent ? (
            <p className="msp-banner">
              Als dit adres een account heeft, staat de inloglink in de inbox van {email}.
            </p>
          ) : (
            <form onSubmit={handleMagicLink}>
              <button type="submit" disabled={loading} className="msp-btn msp-btn-ghost msp-btn-block">
                Stuur een inloglink
              </button>
            </form>
          )}
          <p className="msp-lead">
            Nog geen account? <a href="/portal/registreren">Registreer je bedrijf</a>
          </p>
          <p className="msp-foot">© {new Date().getFullYear()} SteraPro · Mijn SteraPro</p>
        </section>
      </div>
    </main>
  )
}
