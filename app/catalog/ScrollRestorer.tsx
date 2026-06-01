'use client'

import { useEffect } from 'react'

/**
 * Onthoudt de scrollpositie van de catalogus per URL (incl. filters/pagina)
 * en herstelt die wanneer je terugkeert — bv. na het bekijken van een plant.
 *
 * Werkt zonder layout-sprong omdat de productkaarten een vaste
 * beeldverhouding hebben: de paginahoogte staat al vast vóór de foto's laden.
 */
export default function ScrollRestorer() {
  useEffect(() => {
    const key = 'catalogScroll:' + window.location.pathname + window.location.search

    // Herstel de bewaarde positie (na de eerstvolgende paints).
    const saved = sessionStorage.getItem(key)
    if (saved) {
      const y = parseInt(saved, 10)
      if (!Number.isNaN(y) && y > 0) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.scrollTo(0, y))
        )
      }
    }

    // Bewaar de positie tijdens het scrollen (max. 1x per frame).
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        sessionStorage.setItem(key, String(window.scrollY))
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', onScroll)
    }
  }, [])

  return null
}
