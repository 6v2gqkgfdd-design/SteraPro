'use client'

import { useRef } from 'react'

/**
 * Form die zichzelf submit zodra een filter wijzigt (checkbox,
 * radiobutton, select). Tekst- of nummervelden submitten NIET op
 * elke toetsaanslag — daarvoor blijft de "Filter toepassen"-knop
 * of Enter binnen het veld.
 */
export default function AutoSubmitForm({
  children,
  ...props
}: React.FormHTMLAttributes<HTMLFormElement> & {
  children: React.ReactNode
}) {
  const ref = useRef<HTMLFormElement>(null)

  function handleChange(e: React.FormEvent<HTMLFormElement>) {
    const target = e.target
    if (target instanceof HTMLInputElement) {
      const t = target.type
      if (t === 'text' || t === 'search' || t === 'number' || t === 'date') {
        return
      }
    }
    if (target instanceof HTMLTextAreaElement) return
    ref.current?.requestSubmit()
  }

  return (
    <form ref={ref} onChange={handleChange} {...props}>
      {children}
    </form>
  )
}
