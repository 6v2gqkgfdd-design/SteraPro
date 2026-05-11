/**
 * Eén centrale helper om een ruimte-label te formatteren.
 *
 * Voorbeeld:
 *   formatRoomLabel('Kantoren', '2')              → 'Kantoren · Verdiep 2'
 *   formatRoomLabel('Verdieping 1', '1')          → 'Verdieping 1'   (geen dubbel)
 *   formatRoomLabel('Souterrain', 'S')            → 'Souterrain'     (geen dubbel)
 *   formatRoomLabel('Gelijkvloers links', '0')    → 'Gelijkvloers links'
 *   formatRoomLabel('Gelijkvloers links', null)   → 'Gelijkvloers links'
 *   formatRoomLabel(null, '3')                    → 'Verdiep 3'
 */
export function formatRoomLabel(
  name: string | null | undefined,
  floor?: string | null
): string {
  const n = (name || '').trim()
  const fl = (floor || '').trim()

  if (!n && !fl) return 'Ruimte'
  if (!n) {
    return /^\d+$/.test(fl) ? `Verdiep ${fl}` : fl
  }
  if (!fl) return n

  // Als de naam al een verdieping-aanduiding bevat: niets toevoegen.
  const lc = n.toLowerCase()
  if (
    lc.includes('verdiep') ||
    lc.includes('gelijkvloer') ||
    lc.includes('souterrain') ||
    lc.includes('parter') // parterre
  ) {
    return n
  }

  // Anders: 'Naam · Verdiep X' voor cijfers, 'Naam · floor' voor tekst.
  const isNumeric = /^\d+$/.test(fl)
  return isNumeric ? `${n} · Verdiep ${fl}` : `${n} · ${fl}`
}
