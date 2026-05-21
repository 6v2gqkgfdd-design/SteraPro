/**
 * Bouwt een URL naar de interne foto-proxy (/api/wo-image) voor
 * werkbon-foto's. De proxy levert de foto verkleind en als compacte
 * JPEG aan, zodat een werkbon die naar PDF afgedrukt wordt klein
 * genoeg blijft om te mailen.
 *
 * Data-URL's (bv. een handtekening) worden ongewijzigd teruggegeven.
 */
export function woImage(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('data:')) return url
  return `/api/wo-image?u=${encodeURIComponent(url)}`
}
