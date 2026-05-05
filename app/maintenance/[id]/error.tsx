'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

function describeError(error: unknown) {
  if (error == null) return 'null'
  if (typeof error !== 'object') return String(error)

  const own: Record<string, unknown> = {}
  for (const key of Object.getOwnPropertyNames(error)) {
    try {
      own[key] = (error as Record<string, unknown>)[key]
    } catch (err) {
      own[key] = `<unreadable: ${String(err)}>`
    }
  }

  try {
    return JSON.stringify(own, null, 2)
  } catch {
    return String(error)
  }
}

export default function MaintenanceSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()
  const [ua, setUa] = useState('')

  useEffect(() => {
    console.error('[maintenance segment error]', error)
    if (typeof navigator !== 'undefined') {
      setUa(navigator.userAgent)
    }
  }, [error])

  const dump = describeError(error)
  const constructorName =
    error && typeof error === 'object'
      ? (error as { constructor?: { name?: string } }).constructor?.name ?? 'Object'
      : typeof error

  return (
    <main className="min-h-screen bg-[#F7F4EF] text-[#1A2F6E] flex flex-col">
      <header className="px-5 py-5 sm:px-10 sm:py-8 border-b border-[#1A2F6E]/15">
        <Link href="/" className="stera-wordmark text-[#1A2F6E] text-base sm:text-lg">
          Stéra<span className="text-[#4A7C59]">Pro</span>
        </Link>
      </header>

      <div className="flex-1 px-5 py-10 sm:px-10 sm:py-16">
        <div className="mx-auto w-full max-w-xl">
          <p className="stera-eyebrow text-[#4A7C59] mb-4">Onderhoud · Fout</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Deze onderhoudspagina kon niet geladen worden
          </h1>
          <p className="text-base text-[#1A2F6E]/75 leading-relaxed mb-3">
            Er ging iets mis bij het laden van deze pagina. Dit kan gebeuren bij
            een trage verbinding, een verlopen sessie, of een tijdelijke storing.
          </p>
          <p className="text-sm text-[#1A2F6E]/60 mb-4">
            Probeer het opnieuw, of ga terug naar het onderhoudsoverzicht.
          </p>

          <div className="mb-10 rounded border border-[#1A2F6E]/15 bg-white/60 p-3 text-xs text-[#1A2F6E]/80 space-y-2">
            <p className="font-semibold uppercase tracking-wide text-[#1A2F6E]/55">
              Technische details
            </p>

            <p className="break-words">
              <span className="font-mono text-[#1A2F6E]/55">type:</span>{' '}
              <span className="font-mono text-[#1A2F6E]">{constructorName}</span>
            </p>

            <p className="break-words">
              <span className="font-mono text-[#1A2F6E]/55">message:</span>{' '}
              <span className="font-mono text-[#1A2F6E]">
                {error?.message ? error.message : '(leeg)'}
              </span>
            </p>

            {error?.digest ? (
              <p className="font-mono break-all text-[#1A2F6E]/70">
                ref: {error.digest}
              </p>
            ) : (
              <p className="italic">geen digest aanwezig</p>
            )}

            {pathname ? (
              <p className="break-all">
                <span className="font-mono text-[#1A2F6E]/55">path:</span>{' '}
                <span className="font-mono text-[#1A2F6E]">{pathname}</span>
              </p>
            ) : null}

            {ua ? (
              <p className="break-all">
                <span className="font-mono text-[#1A2F6E]/55">ua:</span>{' '}
                <span className="font-mono text-[#1A2F6E]/70">{ua}</span>
              </p>
            ) : null}

            <details>
              <summary className="cursor-pointer text-[#4A7C59]">
                Volledig error-object
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] leading-snug text-[#1A2F6E]/70">
                {dump}
              </pre>
            </details>

            {error?.stack ? (
              <details>
                <summary className="cursor-pointer text-[#4A7C59]">
                  Stack trace
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] leading-snug text-[#1A2F6E]/70">
                  {error.stack}
                </pre>
              </details>
            ) : null}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="stera-cta inline-flex items-center justify-center bg-[#1A2F6E] px-6 py-4 text-sm text-white hover:bg-[#13245a]"
            >
              Opnieuw proberen →
            </button>
            <Link
              href="/maintenance"
              className="stera-cta inline-flex items-center justify-center border border-[#1A2F6E] px-6 py-4 text-sm text-[#1A2F6E] hover:bg-[#1A2F6E] hover:text-white"
            >
              Onderhoudsoverzicht
            </Link>
            <Link
              href="/dashboard"
              className="stera-cta inline-flex items-center justify-center border border-[#1A2F6E] px-6 py-4 text-sm text-[#1A2F6E] hover:bg-[#1A2F6E] hover:text-white"
            >
              Dashboard
            </Link>
          </div>

          <div className="mt-10 text-xs text-[#1A2F6E]/55">
            Niet ingelogd?{' '}
            <Link href="/login" className="underline hover:text-[#1A2F6E]">
              Inloggen
            </Link>
          </div>
        </div>
      </div>

      <footer className="px-5 py-5 sm:px-10 text-xs text-[#1A2F6E]/60 border-t border-[#1A2F6E]/15">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}
