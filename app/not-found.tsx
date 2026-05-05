import Link from 'next/link'
import SteraLogo from '@/components/stera-logo'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pagina niet gevonden',
  description: 'De pagina die je zoekt bestaat niet of is verplaatst.',
}

export default function NotFound() {
  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink flex flex-col">
      <header className="px-6 py-6 sm:px-10 sm:py-8 border-b border-stera-line">
        <SteraLogo variant="default" />
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl">
          <p className="stera-eyebrow text-stera-green mb-4">404 · Niet gevonden</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5">
            Deze pagina bestaat niet
          </h1>
          <p className="text-base text-stera-ink-soft leading-relaxed mb-10 max-w-md">
            De link die je volgde is mogelijk verouderd of verplaatst. Geen zorgen — je
            kunt hieronder verder.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/login"
              className="stera-cta inline-flex items-center justify-center bg-stera-green px-6 py-4 text-sm text-white hover:bg-stera-green-deep"
            >
              Naar inloggen →
            </Link>
            <Link
              href="/"
              className="stera-cta inline-flex items-center justify-center border border-stera-green px-6 py-4 text-sm text-stera-ink hover:bg-stera-green hover:text-white"
            >
              Terug naar start
            </Link>
          </div>
        </div>
      </div>

      <footer className="px-6 py-6 sm:px-10 text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}
