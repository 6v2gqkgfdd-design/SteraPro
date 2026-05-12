import Link from 'next/link'

export type Crumb = {
  label: string
  href?: string
}

/**
 * Compacte breadcrumb-balk voor diepe pagina's.
 * Laatste crumb is altijd niet-klikbaar (huidige pagina).
 *
 * Voorbeeld:
 *   <Breadcrumbs items={[
 *     { label: 'Klanten', href: '/companies' },
 *     { label: 'Vanden Broele', href: '/companies/abc' },
 *     { label: 'Gemeenschappelijk gebouw' },
 *   ]} />
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items.length) return null
  return (
    <nav aria-label="Kruimelpad" className="text-xs text-stera-ink-soft">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((crumb, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="hover:text-stera-green hover:underline underline-offset-4"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={isLast ? 'text-stera-ink' : ''}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
              {!isLast ? <span aria-hidden>›</span> : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
