/**
 * Standaard onderhoudsacties voor een gezonde plant.
 *
 * Wanneer Jelle een locatie rondloopt en bij een gezonde plant niets
 * uitzonderlijks doet, voert hij eigenlijk altijd dit lijstje uit:
 * water geven, voeding, lichtjes snoeien, controle, draaien en
 * bladglans. We gebruiken deze constante zowel voor de bulk-actie
 * 'Pas standaard onderhoud toe' als voor het pre-vullen van de
 * checkboxes wanneer een nieuwe plant aan een lopend onderhoud
 * wordt toegevoegd.
 */
export const STANDARD_MAINTENANCE_ACTIONS = {
  action_checked: true,
  action_watered: true,
  action_pruned: true,
  action_fed: true,
  action_rotated: true,
  action_polished: true,
  // Bewust NIET in standaard:
  //   action_cleaned (extra bladreiniging — gebeurt minder routine)
  //   action_repotted (alleen indien nodig)
  //   action_replaced (alleen indien nodig)
} as const

// Plastiek / kunstplanten krijgen geen water, voeding, snoei of draaien —
// enkel een snelle controle + bladglans-spuitbus.
export const STANDARD_MAINTENANCE_ACTIONS_ARTIFICIAL = {
  action_checked: true,
  action_watered: false,
  action_pruned: false,
  action_fed: false,
  action_rotated: false,
  action_polished: true,
  action_cleaned: true, // even afstoffen mag wel
} as const

export const STANDARD_MAINTENANCE_HEALTH_STATUS = 'healthy'
