// Plantconfigurator — vraagdefinities + types.
// De plantdata komt LIVE uit /api/configurator/catalog (het echte
// webshop-assortiment: All-in-1 concepts met situatie-tags).

export type CfgPot = { pot: string; handle: string; variantId: string; available: boolean }
export type CfgPlant = {
  plant: string
  light: string[]
  sizes: string[]
  outdoor: boolean
  hydro: boolean
  image: string | null
  pots: CfgPot[]
}

export type CfgOption = { v: string; t: string; d: string }
export type CfgQuestion = { key: 'light' | 'size' | 'plek'; title: string; sub: string; opts: CfgOption[] }

export const CFG_STEPS = ['Jouw ruimte', 'Planten', 'Potten', 'Overzicht'] as const

export const CFG_Q: CfgQuestion[] = [
  {
    key: 'light',
    title: 'Hoeveel licht valt er binnen?',
    sub: 'Kijk naar de plek waar de planten komen, niet naar het raam zelf.',
    opts: [
      { v: 'Veel licht', t: 'Veel licht', d: 'Vlak bij grote ramen, veel daglicht of zon' },
      { v: 'Gemiddeld licht', t: 'Gemiddeld licht', d: 'Heldere ruimte, niet pal in de zon' },
      { v: 'any', t: 'Maakt niet uit', d: 'Toon planten voor elke lichtsituatie' },
    ],
  },
  {
    key: 'size',
    title: 'Hoe groot mogen de planten zijn?',
    sub: 'De juiste maat hangt af van de ruimte en het effect dat je wil.',
    opts: [
      { v: 'Compact (tot 60 cm)', t: 'Compact', d: 'Tot ± 60 cm — balies, vensterbanken, bureaus' },
      { v: 'Middelgroot (60-120 cm)', t: 'Middelgroot', d: '60 – 120 cm — accenten in de ruimte' },
      { v: 'Groot (120-180 cm)', t: 'Groot', d: '120 – 180 cm — blikvangers' },
      { v: 'Extra groot (180+ cm)', t: 'Extra groot', d: '180 cm + — zonering en wow-effect' },
      { v: 'any', t: 'Maakt niet uit', d: 'Toon alle maten' },
    ],
  },
  {
    key: 'plek',
    title: 'Waar komen de planten?',
    sub: 'Buiten vraagt planten die tegen weer en wind kunnen.',
    opts: [
      { v: 'binnen', t: 'Binnen', d: 'Kantoor, winkel, praktijk of woning' },
      { v: 'buiten', t: 'Ook buiten', d: 'Terras, ingang of patio — buitengeschikt' },
    ],
  },
]
