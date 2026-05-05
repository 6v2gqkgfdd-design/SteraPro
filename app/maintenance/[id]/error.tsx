'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function MaintenanceSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[maintenance segment error]', error)
  }, [error])

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
          <p className="text-sm text-[#1A2F6E]/60 mb-10">
            Probeer het opnieuw, of ga terug naar het onderhoudsoverzicht.
            {error?.digest ? (
              <>
                {' '}
                <span className="font-mono text-[#1A2F6E]/50 break-all">
                  ref: {error.digest}
                </span>
              </>
            ) : null}
          </p>

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
