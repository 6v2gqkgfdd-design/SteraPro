/**
 * Levering-regel op offertes.
 *
 * Eén gecombineerde "Levering en installatie"-regel die zowel de
 * transport- als de tijdskost dekt. Berekening:
 *
 *   Levering-totaal = transport-tarief + (uren × uurloon)
 *
 *   Uren  = 1 u basis (laden + rijden) + 0,5 u installatie per plant
 *   Transport = €110 standaard, €0 wanneer subtotaal andere regels
 *               ≥ €750 (gratis-transport-bonus). De uren blijven
 *               altijd aangerekend — jouw tijd kost jou ook altijd.
 *
 * Bedrag wordt centraal beheerd hier zodat je in één file kan
 * bijstellen (uurtarief, drempel, transport-tarief).
 */

import { HOURLY_RATE_EUR_CENTS } from './labour'

/** Transport-vaste prijs (zonder marge) in cent. */
export const TRANSPORT_STANDARD_CENTS = 11000

/** Vanaf dit subtotaal (excl. levering) wordt het transport gratis. */
export const TRANSPORT_FREE_THRESHOLD_CENTS = 75000

/** Basisuren per offerte (laden + rijden enkele rit + terug). */
export const DELIVERY_BASE_MINUTES = 60

/**
 * Extra installatietijd per plant.
 * 10 min volstaat normaal: pot zit er al, dus oude plant eruit,
 * nieuwe plant erin, water + check.
 */
export const DELIVERY_MINUTES_PER_PLANT = 10

export type DeliveryPlan = {
  unitPriceCents: number
  name: string
  description: string
  hours: number
  transportCents: number
  labourCents: number
  freeTransport: boolean
}

/**
 * Bepaal de gecombineerde Levering-regel.
 *
 * @param nonDeliverySubtotalCents Subtotaal van alle niet-levering-regels
 *   (combinaties, planten, potten, ...). Bepaalt of het transport
 *   gratis is.
 * @param plantCount Aantal vervangings-regels in de offerte. Bepaalt
 *   de installatietijd (1u + 0,5u per plant). Default 0.
 */
export function planDelivery(
  nonDeliverySubtotalCents: number,
  plantCount: number = 0
): DeliveryPlan {
  const freeTransport =
    nonDeliverySubtotalCents >= TRANSPORT_FREE_THRESHOLD_CENTS
  const transportCents = freeTransport ? 0 : TRANSPORT_STANDARD_CENTS

  const minutes =
    DELIVERY_BASE_MINUTES + DELIVERY_MINUTES_PER_PLANT * Math.max(0, plantCount)
  const hours = minutes / 60
  const labourCents = Math.round((minutes / 60) * HOURLY_RATE_EUR_CENTS)

  const unitPriceCents = transportCents + labourCents

  const name = freeTransport
    ? 'Levering en installatie (transport gratis)'
    : 'Levering en installatie'

  const hoursLabel = hours % 1 === 0 ? `${hours} u` : `${hours.toFixed(1)} u`
  const description = freeTransport
    ? `Inclusief plaatsing van de planten op locatie (${hoursLabel}). Het transport zelf is gratis vanaf €750 aan planten.`
    : `Inclusief transport (€${(TRANSPORT_STANDARD_CENTS / 100).toFixed(0)}) en plaatsing van de planten op locatie (${hoursLabel}). Transport wordt gratis vanaf €750 aan planten.`

  return {
    unitPriceCents,
    name,
    description,
    hours,
    transportCents,
    labourCents,
    freeTransport,
  }
}
