'use client'

import { useState } from 'react'

/**
 * Toont de publieke deel-link voor een offerte en een knop om hem te
 * kopiëren naar het klembord. De link gaat naar /q/<signing_token>.
 */
export default function ShareQuoteLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  // We berekenen de volledige URL pas client-side; daar weten we de
  // current origin (werkt zo in zowel dev als prod).
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/q/${token}`
      : `/q/${token}`

  async function copy() {
    setError('')
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setError('Kopiëren mislukt — selecteer de link handmatig.')
    }
  }

  return (
    <div className="stera-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-stera-ink">
          Klant-link
        </p>
        <p className="mt-0.5 text-xs text-stera-ink-soft">
          Deel deze link met je klant. Hij kan per regel akkoord/niet
          akkoord aanduiden en digitaal ondertekenen.
        </p>
        <code className="mt-2 block break-all rounded border border-stera-line bg-white px-2 py-1.5 text-xs font-mono text-stera-ink-soft">
          {url}
        </code>
        {error ? (
          <p className="mt-1 text-xs text-red-700">{error}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-stera-ink/20 bg-white px-4 py-2 text-sm font-medium text-stera-ink transition hover:bg-stera-cream-deep"
        >
          {copied ? '✓ Gekopieerd' : 'Kopieer link'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-stera-ink/20 bg-white px-4 py-2 text-center text-sm font-medium text-stera-ink transition hover:bg-stera-cream-deep"
        >
          Bekijk
        </a>
      </div>
    </div>
  )
}
