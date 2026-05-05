import Link from 'next/link'
import SteraLogo from './stera-logo'

type Action = {
  label: string
  href: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

export default function SteraShell({
  children,
  actions,
  showFooter = true,
}: {
  children: React.ReactNode
  actions?: Action[]
  showFooter?: boolean
}) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-stera-line bg-stera-cream">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <SteraLogo />

          {actions && actions.length > 0 ? (
            <nav className="flex flex-wrap items-center gap-2">
              {actions.map((action) => {
                const variantClass =
                  action.variant === 'primary'
                    ? 'stera-cta stera-cta-primary'
                    : action.variant === 'secondary'
                      ? 'stera-cta stera-cta-secondary'
                      : 'stera-cta stera-cta-ghost'
                return (
                  <Link
                    key={`${action.label}-${action.href}`}
                    href={action.href}
                    className={variantClass}
                  >
                    {action.label}
                  </Link>
                )
              })}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="flex-1 bg-stera-cream">{children}</main>

      {showFooter ? (
        <footer className="border-t border-stera-line bg-stera-cream-deep">
          <div className="mx-auto max-w-5xl px-5 py-6 text-xs text-stera-ink-soft sm:px-8">
            © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
          </div>
        </footer>
      ) : null}
    </div>
  )
}
