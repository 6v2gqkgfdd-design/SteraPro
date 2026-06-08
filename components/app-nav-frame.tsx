'use client'

import { usePathname } from 'next/navigation'

/** Pagina's waar de bottom-/side-nav verborgen is — hier ook geen padding. */
const HIDDEN_PREFIXES = ['/login', '/signup', '/p/', '/sign/', '/q/', '/portal']

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
  const hidden =
    pathname.endsWith('/print') ||
    HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))

  if (hidden) {
    return <>{children}</>
  }

  // pb-24 ruimt de bottom-nav op mobile; md:pl-20 maakt plaats voor de
  // sidebar op desktop. paddingTop = safe-area-inset-top zodat we onder
  // de iPhone notch / Dynamic Island uitkomen wanneer de app als PWA
  // draait (zonder browser-balk bovenaan).
  return (
    <div
      className="md:pl-64 pb-24 md:pb-0"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {children}
    </div>
  )
}
