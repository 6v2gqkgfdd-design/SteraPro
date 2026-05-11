'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Compact "⋯"-menu voor secundaire acties (Bewerken / QR / Verwijderen).
 * Houdt de UI clean op mobile: één klein knopje opent een dropdown ipv
 * vier knoppen die op één rij proberen te passen.
 */
export function RowMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKey)
    }
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Meer acties"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-stera-line bg-white text-stera-ink transition hover:border-stera-green"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="5" cy="12" r="1.2" />
          <circle cx="12" cy="12" r="1.2" />
          <circle cx="19" cy="12" r="1.2" />
        </svg>
      </button>
      {open ? (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 z-30 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-stera-line bg-white py-1 shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** Eén klikbare regel in een RowMenu. */
export function RowMenuItem({
  href,
  onClick,
  danger,
  children,
}: {
  href?: string
  onClick?: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  const cls = `block w-full px-4 py-3 text-left text-sm transition ${
    danger
      ? 'text-red-700 hover:bg-red-50'
      : 'text-stera-ink hover:bg-stera-cream-deep'
  }`
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  )
}
