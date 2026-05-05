import Link from 'next/link'

type Variant = 'default' | 'compact' | 'inverted'

const SIZE: Record<Variant, string> = {
  default: 'text-2xl sm:text-3xl',
  compact: 'text-xl',
  inverted: 'text-2xl sm:text-3xl',
}

export default function SteraLogo({
  variant = 'default',
  href = '/',
  className = '',
}: {
  variant?: Variant
  href?: string | null
  className?: string
}) {
  const inverted = variant === 'inverted'
  const tone = inverted ? 'text-white' : 'text-stera-green'
  const proTone = inverted ? 'text-white/80' : 'text-stera-ink/80'
  const sizeCls = SIZE[variant]

  const content = (
    <span
      className={`stera-wordmark inline-flex items-baseline gap-1 ${sizeCls} ${tone} ${className}`}
    >
      <span>STERA</span>
      <span className={`text-[0.55em] tracking-[0.2em] ${proTone}`}>
        PRO
      </span>
    </span>
  )

  if (!href) return content

  return (
    <Link href={href} className="inline-flex items-baseline">
      {content}
    </Link>
  )
}
