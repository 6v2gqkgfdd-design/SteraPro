'use client'

import { useRouter } from 'next/navigation'

/**
 * Gaat één stap terug in de geschiedenis (zoals de telefoon-terugknop),
 * zodat je op dezelfde scrollpositie in de catalogus terugkomt. Valt
 * terug op /catalog als er geen geschiedenis is.
 */
export default function BackButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back()
        else router.push('/catalog')
      }}
      className="inline-flex items-center gap-1 text-sm text-stera-ink/70 transition hover:text-stera-green"
    >
      ← Terug
    </button>
  )
}
