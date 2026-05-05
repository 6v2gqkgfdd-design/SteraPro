'use client'

import Link from 'next/link'
import SteraLogo from '@/components/stera-logo'
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
    <main className="min-h-screen bg-stera-cream text-stera-ink flex flex-col">
      <header className="px-5 py-5 sm:px-10 sm:py-8 border-b border-stera-line">
        <SteraLogo variant="default" />
      </header>

      <div className="flex-1 px-5 py-10 sm:px-10 sm:py-16">
        <div className="mx-auto w-full max-w-xl">
          <p className="stera-eyebrow text-stera-green mb-4">Onderhoud · Fout</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Deze onderhoudspagina kon niet geladen worden
          </h1>
          <p className="text-base text-stera-ink-soft leading-relaxed mb-3">
            Er ging iets mis bij het laden van deze pagina. Dit kan gebeuren bij
            een trage verbinding, een verlopen sessie, of een tijdelijke storing.
          </p>
          <p className="text-sm text-stera-ink-soft mb-4">
            Probeer het opnieuw, of ga terug naar het onderhoudsoverzicht.
          </p>

          <div className="mb-10 rounded border border-stera-line bg-white/60 p-3 text-xs text-stera-ink-soft space-y-2">
            <p className="font-semibold uppercase tracking-wide text-stera-ink-soft">
              Technische details
            </p>

            <p className="break-words">
              <span className="font-mono text-stera-ink-soft">type:</span>{' '}
              <span className="font-mono text-stera-ink">{constructorName}</span>
            </p>

            <p className="break-words">
              <span className="font-mono text-stera-ink-soft">message:</span>{' '}
              <span className="font-mono text-stera-ink">
                {error?.message ? error.message : '(leeg)'}
              </span>
            </p>

            {error?.digest ? (
              <p className="font-mono break-all text-stera-ink-soft">
                ref: {error.digest}
              </p>
            ) : (
              <p className="italic">geen digest aanwezig</p>
            )}

            {pathname ? (
              <p className="break-all">
                <span className="font-mono text-stera-ink-soft">path:</span>{' '}
                <span className="font-mono text-stera-ink">{pathname}</span>
              </p>
            ) : null}

            {ua ? (
              <p className="break-all">
                <span className="font-mono text-stera-ink-soft">ua:</span>{' '}
                <span className="font-mono text-stera-ink-soft">{ua}</span>
              </p>
            ) : null}

            <details>
              <summary className="cursor-pointer text-stera-green">
                Volledig error-object
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] leading-snug text-stera-ink-soft">
                {dump}
              </pre>
            </details>

            {error?.stack ? (
              <details>
                <summary className="cursor-pointer text-stera-green">
                  Stack trace
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] leading-snug text-stera-ink-soft">
                  {error.stack}
                </pre>
              </details>
            ) : null}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="stera-cta inline-flex items-center justify-center bg-stera-green px-6 py-4 text-sm text-white hover:bg-stera-green-deep"
            >
              Opnieuw proberen →
            </button>
            <Link
              href="/maintenance"
              className="stera-cta inline-flex items-center justify-center border border-stera-green px-6 py-4 text-sm text-stera-ink hover:bg-stera-green hover:text-white"
            >
              Onderhoudsoverzicht
            </Link>
            </div>

          <div className="mt-10 text-xs text-stera-ink-soft">
            Niet ingelogd?{' '}
            <Link href="/login" className="underline hover:text-stera-green">
              Inloggen
            </Link>
          </div>
        </div>
      </div>

      <footer className="px-5 py-5 sm:px-10 text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}
