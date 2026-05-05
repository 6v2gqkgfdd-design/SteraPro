'use client'

import Link from 'next/link'
import { useState } from 'react'

type Variant = 'default' | 'compact' | 'inverted' | 'hero'

const HEIGHT_CLASS: Record<Variant, string> = {
  default: 'h-7 sm:h-8',
  compact: 'h-6',
  inverted: 'h-7 sm:h-8',
  hero: 'h-12 sm:h-16',
}

const TEXT_SIZE: Record<Variant, string> = {
  default: 'text-2xl sm:text-3xl',
  compact: 'text-xl',
  inverted: 'text-2xl sm:text-3xl',
  hero: 'text-4xl sm:text-5xl',
}

/**
 * Render the Stera logo. Tries the real wordmark file at
 * /stera-logo.png first; if that fails (file not yet uploaded),
 * falls back to a styled text wordmark in Instrument Serif italic.
 *
 * Drop the official PNG/SVG into /public/stera-logo.png to use the
 * real artwork everywhere it shows up. Add /public/stera-icon.png for
 * the standalone "S" icon variant.
 */
export default function SteraLogo({
  variant = 'default',
  href = '/',
  className = '',
  withProSuffix = true,
}: {
  variant?: Variant
  href?: string | null
  className?: string
  withProSuffix?: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const inverted = variant === 'inverted'
  const tone = inverted ? 'text-white' : 'text-stera-green'
  const proTone = inverted ? 'text-white/85' : 'text-stera-ink/80'
  const heightCls = HEIGHT_CLASS[variant]
  const textSizeCls = TEXT_SIZE[variant]

  const content = imageFailed ? (
    <span
      className={`stera-wordmark inline-flex items-baseline gap-1 ${textSizeCls} ${tone} ${className}`}
    >
      <span>STERA</span>
      {withProSuffix ? (
        <span className={`text-[0.55em] tracking-[0.2em] ${proTone}`}>
          PRO
        </span>
      ) : null}
    </span>
  ) : (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/stera-logo.png"
        alt="Stera"
        className={`${heightCls} w-auto select-none`}
        onError={() => setImageFailed(true)}
      />
      {withProSuffix ? (
        <span
          className={`stera-wordmark text-[0.7em] tracking-[0.2em] ${proTone}`}
          style={{ fontSize: '0.6rem', lineHeight: 1 }}
        >
          PRO
        </span>
      ) : null}
    </span>
  )

  if (!href) return content

  return (
    <Link href={href} className="inline-flex items-baseline">
      {content}
    </Link>
  )
}
