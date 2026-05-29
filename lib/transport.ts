/**
 * Transport-regel op offertes.
 *
 * Elke nieuwe offerte krijgt automatisch een transport-regel:
 *  - subtotaal van de andere regels < €750 → €110 excl. btw
 *  - subtotaal van de andere regels ≥ €750 → €0, label "Gratis
 *    levering vanaf €750" (commercieel argument naar de klant).
 *
 * De tech kan altijd manueel aanpassen via de bouwer (zoals elke
 * andere regel). Wanneer de tech het bedrag wijzigt, schakelt de live
 * herrekening uit voor die offerte.
 */

export const TRANSPORT_STANDARD_CENTS = 11000
export const TRANSPORT_FREE_THRESHOLD_CENTS = 75000

export type TransportPlan = {
  unitPriceCents: number
  name: string
  description: string | null
}

/**
 * Bepaal de transport-regel voor een gegeven subtotaal (excl. transport).
 */
export function planTransport(
  nonTransportSubtotalCents: number
): TransportPlan {
  if (nonTransportSubtotalCents >= TRANSPORT_FREE_THRESHOLD_CENTS) {
    return {
      unitPriceCents: 0,
      name: 'Gratis levering',
      description:
        'Vanaf €750 aan planten leveren we kosteloos bij u op locatie.',
    }
  }
  return {
    unitPriceCents: TRANSPORT_STANDARD_CENTS,
    name: 'Transport en levering',
    description:
      'Levering aan huis met laadbrug. Wordt gratis vanaf €750 aan planten.',
  }
}
