'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Filter-formulier dat bij een wijziging (checkbox/radio/select) of bij
 * verzenden (Enter / "Filter toepassen") de URL bijwerkt via een ZACHTE
 * navigatie — geen volledige herlaadbeurt, geen witte flits, en zonder
 * naar boven te springen. Tijdens het laden blijven de resultaten staan
 * (licht gedimd) zodat het aanvoelt als een vlotte webapp.
 *
 * Tekst-/nummervelden submitten niet op elke toetsaanslag; daarvoor dient
 * Enter of de "Filter toepassen"-knop.
 */
export default function AutoSubmitForm({
  children,
  ...props
}: React.FormHTMLAttributes<HTMLFormElement> & {
  children: React.ReactNode
}) {
  const ref = useRef<HTMLFormElement>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function navigate() {
    const form = ref.current
    if (!form) return
    const fd = new FormData(form)
    const params = new URLSearchParams()
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string' && v !== '') params.append(k, v)
    }
    const action =
      (typeof props.action === 'string' && props.action) ||
      window.location.pathname
    const qs = params.toString()
    startTransition(() => {
      // scroll: false → blijf op dezelfde hoogte staan bij het filteren.
      router.replace(qs ? `${action}?${qs}` : action, { scroll: false })
    })
  }

  function handleChange(e: React.FormEvent<HTMLFormElement>) {
    const target = e.target
    if (target instanceof HTMLInputElement) {
      const t = target.type
      if (t === 'text' || t === 'search' || t === 'number' || t === 'date') {
        return
      }
    }
    if (target instanceof HTMLTextAreaElement) return
    navigate()
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    navigate()
  }

  return (
    <form
      ref={ref}
      onChange={handleChange}
      onSubmit={handleSubmit}
      {...props}
    >
      <div
        aria-busy={isPending}
        className={`transition-opacity duration-200 ${
          isPending ? 'pointer-events-none opacity-60' : 'opacity-100'
        }`}
      >
        {children}
      </div>
    </form>
  )
}
