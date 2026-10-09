import { AsyncLocalStorage } from 'node:async_hooks'

export type MspStore = {
  /** Linkvoorvoegsel, bv. /portal of /apps/mijn/voorbeeld */
  base: string
  demo: boolean
  /** Antwoord voor de Shopify-proxy: fragment, geen eigen html-schil. */
  liquid: boolean
}

export const mspAls = new AsyncLocalStorage<MspStore>()

export function mspStore(): MspStore {
  return mspAls.getStore() || { base: '/portal', demo: false, liquid: false }
}

/** /portal/onderhoud → voorvoegsel + /onderhoud. Publieke paden (/p, /q) blijven. */
export function mspHref(to: string): string {
  const base = mspStore().base.replace(/\/$/, '')
  if (to.startsWith('/p/') || to.startsWith('/q/') || to.startsWith('/apps/')) {
    if (to.startsWith('/p/') && base.startsWith('/apps/mijn')) {
      return `/apps/mijn${to}`
    }
    return to
  }
  const path = to.startsWith('/portal') ? to.slice('/portal'.length) : to
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export function plantPublicUrl(slug: string): string {
  return `https://sterapro.be/apps/mijn/p/${slug}`
}

/** Absoluut, anders zoekt sterapro.be het bestand in de shop en krijgt een 404. */
export const SHOP_LOGO_URL = 'https://app.sterapro.be/sterapro-shop-logo.png'

export const MSP_FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600&family=Instrument+Serif:ital@0;1&display=swap'

/** Formulieren posten hierheen. Onder de proxy blijft de browser op sterapro.be. */
export function mspApi(kind: 'melding' | 'notitie' | 'aanvraag'): string {
  return mspStore().base.startsWith('/apps/') ? `/apps/mijn/api/${kind}` : `/api/portal/${kind}`
}
