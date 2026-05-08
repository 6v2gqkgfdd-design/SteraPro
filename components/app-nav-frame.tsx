'use client'

import { usePathname } from 'next/navigation'

/** Pagina's waar de bottom-/side-nav verborgen is — hier ook geen padding. */
const HIDDEN_PREFIXES = ['/login', '/signup', '/p/', '/sign/']

/**
 * Wrapper rond de paginainhoud die de side-rail (md:pl-20) en
 * bottom-nav (pb-24) padding alleen toepast op pagina's waar de
 * AppNav effectief getoond wordt. Voor klant-vriendelijke
 * publieke pagina's (signing, QR-info, login) krijgen we zo een
 * volledig schoon scherm.
 */
export default function AppNavFrame({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() || ''
  const hidden = HIDDEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p)
  )

  if (hidden) {
    return <>{children}</>
  }

  return <div className="md:pl-20 pb-24 md:pb-0">{children}</div>
}
