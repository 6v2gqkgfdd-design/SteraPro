'use client'

/**
 * Eenvoudige fullscreen lightbox voor productfoto’s.
 * Toont de full-res URL; sluit met Escape, klik buiten of knop.
 */

import { useEffect } from 'react'

type Props = {
  src: string
  alt?: string
  open: boolean
  onClose: () => void
}

export function ImageLightbox({ src, alt = '', open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto vergroten"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-stera-ink shadow hover:bg-white"
      >
        Sluiten ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[min(90vw,1200px)] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
