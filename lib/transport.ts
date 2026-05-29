/**
 * Levering-regel op offertes.
 *
 * Eén "Levering en installatie"-regel per offerte met drie vaste
 * tarieven, gebaseerd op het subtotaal van de andere regels:
 *
 *   Subtotaal < €300       → €99
 *   Subtotaal €300 – €749  → €49
 *   Subtotaal ≥ €750       → Gratis
 *
 * Commerciële redenering: psychologische prijspunten (€99 / €49 / €0)
 * werken sterker dan een berekende uurloon-prijs. Onder €300 dekt de
 * €99 grotendeels de echte kostprijs; bij grotere offertes haalt de
 * plant-marge het verlies ruim binnen. De "Gratis vanaf €750"-grens
 * fungeert als upsell-prikkel.
 *
 * Tech kan de regel altijd manueel aanpassen of verwijderen.
 */

/** Onderste prijspunt (kleine offertes onder €300). */
export const DELIVERY_PRICE_LOW_CENTS = 9900

/** Middelste prijspunt (€300 – €749). */
export const DELIVERY_PRICE_MID_CENTS = 4900

/** Drempel waaronder we het volle €99-tarief vragen. */
export const DELIVERY_LOW_THRESHOLD_CENTS = 30000

/** Drempel waarboven we gratis leveren. */
export const DELIVERY_FREE_THRESHOLD_CENTS = 75000

export type DeliveryPlan = {
  unitPriceCents: number
  name: string
  description: string
  tier: 'low' | 'mid' | 'free'
}

/**
 * Bepaal de Levering-regel voor een gegeven plantsubtotaal.
 *
 * @param nonDeliverySubtotalCents Subtotaal van alle niet-levering-regels
 *   (combinaties, planten, potten, ...). Bepaalt het tarief.
 */
export function planDelivery(
  nonDeliverySubtotalCents: number
): DeliveryPlan {
  if (nonDeliverySubtotalCents >= DELIVERY_FREE_THRESHOLD_CENTS) {
    return {
      unitPriceCents: 0,
      name: 'Gratis levering en installatie',
      description:
        'Inbegrepen vanaf €750 aan planten. Wij plaatsen alles bij u op locatie.',
      tier: 'free',
    }
  }
  if (nonDeliverySubtotalCents >= DELIVERY_LOW_THRESHOLD_CENTS) {
    return {
      unitPriceCents: DELIVERY_PRICE_MID_CENTS,
      name: 'Levering en installatie',
      description:
        'Wij plaatsen alles bij u op locatie. Gratis vanaf €750 aan planten.',
      tier: 'mid',
    }
  }
  return {
    unitPriceCents: DELIVERY_PRICE_LOW_CENTS,
    name: 'Levering en installatie',
    description:
      'Wij plaatsen alles bij u op locatie. Gratis vanaf €750 aan planten.',
    tier: 'low',
  }
}
