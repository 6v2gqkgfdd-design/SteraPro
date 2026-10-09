/**
 * Fictief voorbeeldbedrijf "Demo Kantoor".
 * Geen echte klantnamen, adressen of prijzen uit de administratie.
 * De bedragen op het contract zijn voorbeeldcijfers en staan zo gelabeld.
 */

export const DEMO_SLUGS = {
  lobby: 'dk-7f3a9c2e1b4d8a60e1',
  wachtzaal: 'dk-7f3a9c2e1b4d8a60e2',
  vergader: 'dk-7f3a9c2e1b4d8a60e3',
} as const

export const DEMO_IDS = {
  company: '11111111-1111-4111-8111-111111111100',
  location: '11111111-1111-4111-8111-111111111110',
  lobby: '11111111-1111-4111-8111-111111111101',
  wachtzaal: '11111111-1111-4111-8111-111111111102',
  vergader: '11111111-1111-4111-8111-111111111103',
  visitPast: '11111111-1111-4111-8111-111111111201',
  visitNext: '11111111-1111-4111-8111-111111111202',
  workSigned: '11111111-1111-4111-8111-111111111301',
  workOpen: '11111111-1111-4111-8111-111111111302',
  quoteAccepted: '11111111-1111-4111-8111-111111111401',
  quoteOpen: '11111111-1111-4111-8111-111111111402',
  orderDelivered: '11111111-1111-4111-8111-111111111501',
  orderScheduled: '11111111-1111-4111-8111-111111111502',
  request: '11111111-1111-4111-8111-111111111601',
  reportYellow: '11111111-1111-4111-8111-111111111701',
  reportWater: '11111111-1111-4111-8111-111111111702',
} as const

export type DemoPlant = {
  id: string
  qr_slug: string
  nickname: string
  common_name: string
  species: string
  status: string
  photo_url: string | null
  care_tips: string
  is_artificial: boolean
  is_dying: boolean
  is_dead: boolean
  needs_replacement: boolean
  installed_at: string
  location_name: string
  room_name: string
  room_floor: string
  customer_note: string | null
  last_actions: string[]
  last_performed_at: string | null
}

export const DEMO_PLANTS: DemoPlant[] = [
  {
    id: DEMO_IDS.lobby,
    qr_slug: DEMO_SLUGS.lobby,
    nickname: 'Lobby',
    common_name: 'Vioolbladplant',
    species: 'Ficus lyrata',
    status: 'healthy',
    photo_url: null,
    care_tips: 'Helder indirect licht. Geef water als de bovenste laag droog aanvoelt. Niet in de tocht van de ingang zetten.',
    is_artificial: false,
    is_dying: false,
    is_dead: false,
    needs_replacement: false,
    installed_at: '2026-03-12',
    location_name: 'Voorbeeldkantoor',
    room_name: 'Ontvangst',
    room_floor: 'Gelijkvloers',
    customer_note: 'Staat links van de balie. Pot niet verschuiven.',
    last_actions: ['water', 'bladeren gereinigd'],
    last_performed_at: '2026-09-18T09:30:00.000Z',
  },
  {
    id: DEMO_IDS.wachtzaal,
    qr_slug: DEMO_SLUGS.wachtzaal,
    nickname: 'Wachtzaal',
    common_name: 'Paradijsvogelbloem',
    species: 'Strelitzia nicolai',
    status: 'needs_attention',
    photo_url: null,
    care_tips: 'Veel licht, geen felle middagzon. Grond licht vochtig houden. Gele onderste bladeren mogen weg.',
    is_artificial: false,
    is_dying: false,
    is_dead: false,
    needs_replacement: false,
    installed_at: '2026-03-12',
    location_name: 'Voorbeeldkantoor',
    room_name: 'Wachtzaal',
    room_floor: 'Gelijkvloers',
    customer_note: null,
    last_actions: ['water'],
    last_performed_at: '2026-09-18T09:40:00.000Z',
  },
  {
    id: DEMO_IDS.vergader,
    qr_slug: DEMO_SLUGS.vergader,
    nickname: 'Vergaderzaal',
    common_name: 'Gatenplant',
    species: 'Monstera deliciosa',
    status: 'healthy',
    photo_url: null,
    care_tips: 'Halfschaduw. Water geven en daarna de pot laten uitlekken. Af en toe een mosstok bijzetten.',
    is_artificial: false,
    is_dying: false,
    is_dead: false,
    needs_replacement: false,
    installed_at: '2026-10-20',
    location_name: 'Voorbeeldkantoor',
    room_name: 'Vergaderzaal',
    room_floor: 'Eerste verdieping',
    customer_note: 'Levering staat ingepland. Nog niet op de definitieve plek.',
    last_actions: [],
    last_performed_at: null,
  },
]

export function isDemoSlug(slug: string): boolean {
  return (Object.values(DEMO_SLUGS) as string[]).includes(slug)
}

export function demoPlantBySlug(slug: string): DemoPlant | null {
  return DEMO_PLANTS.find((plant) => plant.qr_slug === slug) || null
}

export function demoPlantById(id: string): DemoPlant | null {
  return DEMO_PLANTS.find((plant) => plant.id === id) || null
}

/** Wat een scanner zonder login mag zien. Geen klantnaam, prijs of interne notitie. */
export function demoPublicPlant(slug: string) {
  const plant = demoPlantBySlug(slug)
  if (!plant) return null
  return {
    id: plant.id,
    qr_slug: plant.qr_slug,
    nickname: plant.common_name,
    plant_code: null,
    reference_code: null,
    species: plant.species,
    status: plant.status,
    photo_url: plant.photo_url,
    care_tips: plant.care_tips,
    is_dead: plant.is_dead,
    is_dying: plant.is_dying,
    needs_replacement: plant.needs_replacement,
    place: plant.room_name,
    latest_visit: plant.last_performed_at
      ? {
          performed_at: plant.last_performed_at,
          action_watered: plant.last_actions.includes('water'),
          action_pruned: false,
          action_fed: false,
          action_cleaned: plant.last_actions.includes('bladeren gereinigd'),
          action_rotated: false,
          action_repotted: false,
          action_replaced: false,
        }
      : null,
    maintenance_photo_url: null,
  }
}

export function demoCompany() {
  return {
    company_id: DEMO_IDS.company,
    company_name: 'Demo Kantoor',
    has_maintenance_contract: true,
    city: 'Voorbeeldstad',
    location_count: 1,
    plant_count: DEMO_PLANTS.length,
  }
}

export function demoContractSample() {
  return {
    term: '12 maanden',
    frequency: 'elke 4 weken',
    price: '€ 186 / maand excl. btw',
    note: 'Voorbeeldcijfers. Er is nog geen contracttabel; deze bedragen horen alleen bij Demo Kantoor.',
  }
}

export function demoVisits() {
  return [
    {
      id: DEMO_IDS.visitNext,
      title: 'Onderhoudsbeurt voorbeeldkantoor',
      status: 'scheduled',
      scheduled_start: '2026-10-16T08:30:00.000Z',
      scheduled_end: '2026-10-16T10:30:00.000Z',
      ended_at: null,
      performed_by: 'Stera-team',
      general_notes: null,
      location_name: 'Voorbeeldkantoor',
    },
    {
      id: DEMO_IDS.visitPast,
      title: 'Plaatsing en eerste controle',
      status: 'completed',
      scheduled_start: '2026-09-18T08:30:00.000Z',
      scheduled_end: '2026-09-18T11:00:00.000Z',
      ended_at: '2026-09-18T10:50:00.000Z',
      performed_by: 'Stera-team',
      general_notes:
        'Ficus en strelitzia geplaatst in de ontvangst en de wachtzaal. Water gegeven en bladeren afgenomen. De strelitzia had al een geel onderblad; opvolgen bij de volgende beurt.',
      location_name: 'Voorbeeldkantoor',
    },
  ]
}

export function demoWorkOrders() {
  return [
    {
      id: DEMO_IDS.workOpen,
      status: 'sent',
      reference_number: 'WB-2026-091',
      created_at: '2026-10-02T09:00:00.000Z',
      signed_at: null,
      invoiced_at: null,
      invoice_reference: null,
      visit_title: 'Tussentijdse controle strelitzia',
      scheduled_start: '2026-10-16T08:30:00.000Z',
      performed_by: 'Stera-team',
      location_name: 'Voorbeeldkantoor',
      visit_id: DEMO_IDS.visitNext,
    },
    {
      id: DEMO_IDS.workSigned,
      status: 'invoiced',
      reference_number: 'WB-2026-088',
      created_at: '2026-09-18T11:10:00.000Z',
      signed_at: '2026-09-18T11:20:00.000Z',
      invoiced_at: '2026-09-20T08:00:00.000Z',
      invoice_reference: 'F-2026-214',
      visit_title: 'Plaatsing en eerste controle',
      scheduled_start: '2026-09-18T08:30:00.000Z',
      performed_by: 'Stera-team',
      location_name: 'Voorbeeldkantoor',
      visit_id: DEMO_IDS.visitPast,
    },
  ]
}

export function demoQuotes() {
  return [
    {
      id: DEMO_IDS.quoteOpen,
      reference_number: 'OFF-2026-031',
      title: 'Extra plant vergaderzaal',
      status: 'sent',
      intro_note: 'Voorstel voor één extra plant in de vergaderzaal.',
      valid_until: '2026-11-01',
      subtotal_cents: 24800,
      created_at: '2026-09-28T10:00:00.000Z',
      location_name: 'Voorbeeldkantoor',
      signing_token: null,
      lines: [
        {
          name: 'Monstera deliciosa',
          description: 'Inclusief pot en plaatsing',
          quantity: 1,
          unit_price_cents: 24800,
          line_total_cents: 24800,
          customer_decision: null,
        },
      ],
    },
    {
      id: DEMO_IDS.quoteAccepted,
      reference_number: 'OFF-2026-018',
      title: 'Eerste groenaankleding',
      status: 'accepted',
      intro_note: 'Ondertekend voorbeeld. Hierna volgde bestelling en plaatsing.',
      valid_until: '2026-04-01',
      subtotal_cents: 64000,
      created_at: '2026-02-20T10:00:00.000Z',
      location_name: 'Voorbeeldkantoor',
      signing_token: null,
      lines: [
        {
          name: 'Ficus lyrata',
          description: 'Ontvangst',
          quantity: 1,
          unit_price_cents: 34000,
          line_total_cents: 34000,
          customer_decision: 'accepted',
        },
        {
          name: 'Strelitzia nicolai',
          description: 'Wachtzaal',
          quantity: 1,
          unit_price_cents: 30000,
          line_total_cents: 30000,
          customer_decision: 'accepted',
        },
      ],
    },
  ]
}

export function demoOrders() {
  return [
    {
      id: DEMO_IDS.orderScheduled,
      name: 'Voorbeeldorder 1048',
      shopify_order_number: '1048',
      financial_status: 'paid',
      fulfillment_status: null,
      total_price_cents: 24800,
      currency: 'EUR',
      ordered_at: '2026-10-01T14:00:00.000Z',
      delivery_status: 'scheduled',
      scheduled_start: '2026-10-20T09:00:00.000Z',
      location_name: 'Voorbeeldkantoor',
      line_items: [{ title: 'Monstera deliciosa', quantity: 1, variant_title: 'Pot 27 cm' }],
    },
    {
      id: DEMO_IDS.orderDelivered,
      name: 'Voorbeeldorder 1042',
      shopify_order_number: '1042',
      financial_status: 'paid',
      fulfillment_status: 'fulfilled',
      total_price_cents: 64000,
      currency: 'EUR',
      ordered_at: '2026-03-02T11:00:00.000Z',
      delivery_status: 'delivered',
      scheduled_start: '2026-03-12T09:00:00.000Z',
      location_name: 'Voorbeeldkantoor',
      line_items: [
        { title: 'Ficus lyrata', quantity: 1, variant_title: null },
        { title: 'Strelitzia nicolai', quantity: 1, variant_title: null },
      ],
    },
  ]
}

export function demoRequests() {
  return [
    {
      id: DEMO_IDS.request,
      species: 'Sansevieria',
      quantity: '2',
      location_note: 'Gang eerste verdieping',
      message: 'Voorbeeldvraag: twee smalle planten voor de gang, weinig daglicht.',
      status: 'in_behandeling',
      created_at: '2026-09-22T08:15:00.000Z',
    },
  ]
}

export type DemoReport = {
  id: string
  plant_id: string
  slug: string
  issue_type: string
  message: string | null
  reporter_name: string | null
  status: string
  created_at: string
  photo_note: string | null
}

export function demoReports(): DemoReport[] {
  return [
    {
      id: DEMO_IDS.reportYellow,
      plant_id: DEMO_IDS.wachtzaal,
      slug: DEMO_SLUGS.wachtzaal,
      issue_type: 'sick',
      message: 'Onderste bladeren worden geel. Voorbeeldmelding, gekoppeld aan werkbon WB-2026-091.',
      reporter_name: 'Receptie',
      status: 'seen',
      created_at: '2026-10-02T08:05:00.000Z',
      photo_note: null,
    },
    {
      id: DEMO_IDS.reportWater,
      plant_id: DEMO_IDS.lobby,
      slug: DEMO_SLUGS.lobby,
      issue_type: 'other',
      message: 'Schotel stond vol water na het weekend. Voorbeeldmelding, intussen afgehandeld.',
      reporter_name: 'Receptie',
      status: 'handled',
      created_at: '2026-09-21T07:40:00.000Z',
      photo_note: null,
    },
  ]
}

export function demoFlow() {
  return [
    'Webshop of ondertekende offerte OFF-2026-018',
    'Account voor Demo Kantoor (deze demosessie)',
    'Bestelling 1042 geleverd, planten kregen een QR',
    'Melding op de strelitzia',
    'Werkbon WB-2026-091 en de ingeplande beurt van 16 oktober',
  ]
}
