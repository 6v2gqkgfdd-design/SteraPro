/**
 * Skeleton-bouwstenen voor laadtoestanden. Gebruik deze ipv een
 * lege pagina of "Laden..." tekst — de gebruiker ziet de layout
 * direct en voelt de app sneller aan.
 *
 * Voorbeelden in deze file:
 *   <SkeletonLine width="60%" />
 *   <SkeletonCard />
 *   <SkeletonListCard />
 */

export function SkeletonLine({
  width = '100%',
  height = '0.85rem',
  className = '',
}: {
  width?: string
  height?: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-pulse rounded bg-stera-line ${className}`}
      style={{ width, height }}
    />
  )
}

/** Lege kaart in stera-stijl met geblokkeerde tekstregels. */
export function SkeletonCard({
  lines = 2,
  className = '',
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={`stera-card space-y-3 ${className}`}>
      <SkeletonLine width="40%" height="1.1rem" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={`${85 - i * 12}%`}
          height="0.8rem"
        />
      ))}
    </div>
  )
}

/** Rij voor een lijst (planten, afspraken, klanten…). */
export function SkeletonListCard() {
  return (
    <div className="stera-card flex items-center gap-4">
      <span
        aria-hidden
        className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-stera-line"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonLine width="55%" height="1rem" />
        <SkeletonLine width="35%" height="0.8rem" />
      </div>
    </div>
  )
}

/** Compact dashboard-blok: titel + 2 regels. */
export function SkeletonStat() {
  return (
    <div className="rounded-xl border border-stera-line bg-white p-3 space-y-2">
      <SkeletonLine width="40%" height="0.65rem" />
      <SkeletonLine width="30%" height="1.3rem" />
    </div>
  )
}
