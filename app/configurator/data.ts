// Stera Pro — Plantconfigurator · referentiedata
// Bron: design_handoff_sterapro/stera-configurator.jsx (CFG_PLANTS/POTS/Q).
// v1 gebruikt deze curated set; later te vervangen door echte Nieuwkoop-data
// (attributen light/humidity/care/size als metafields op de producten).

export type CfgLight = 'laag' | 'medium' | 'hoog'
export type CfgHumid = 'droog' | 'normaal' | 'vochtig'
export type CfgSize = 'S' | 'M' | 'L'
export type CfgCare = 1 | 2 | 3

export type CfgPlant = {
  id: string
  name: string
  latin: string
  /** typische hoogte in cm */
  h: number
  /** plantpot-diameter in cm (sierpot = +6) */
  pot: number
  light: CfgLight[]
  humid: CfgHumid[]
  care: CfgCare
  size: CfgSize
  img: string
  /** Shopify-producthandle (= slug van de naam) voor de winkelmandje-koppeling.
   *  Server-side resolven we hieruit de variant-ID. */
  shopifyHandle: string
}

const img = (id: string, w = 700) =>
  `https://images.unsplash.com/photo-${id}?q=80&w=${w}&auto=format&fit=crop`

export const CFG_PLANTS: CfgPlant[] = [
  { id: 'sansevieria', name: 'Sansevieria', latin: 'Dracaena trifasciata', h: 90, pot: 21, light: ['laag', 'medium', 'hoog'], humid: ['droog', 'normaal'], care: 1, size: 'M', img: img('1416879595882-3373a0480b5b'), shopifyHandle: 'sansevieria' },
  { id: 'zamioculcas', name: 'Zamioculcas', latin: 'ZZ-plant', h: 100, pot: 24, light: ['laag', 'medium'], humid: ['droog', 'normaal'], care: 1, size: 'M', img: img('1459156212016-c812468e2115'), shopifyHandle: 'zamioculcas' },
  { id: 'kentia', name: 'Kentia', latin: 'Howea forsteriana', h: 180, pot: 27, light: ['medium'], humid: ['normaal'], care: 2, size: 'L', img: img('1470058869958-2a77ade41c02'), shopifyHandle: 'kentia' },
  { id: 'ficus-lyrata', name: 'Ficus lyrata', latin: 'Vioolbladplant', h: 160, pot: 24, light: ['medium', 'hoog'], humid: ['normaal'], care: 2, size: 'L', img: img('1521334884684-d80222895322'), shopifyHandle: 'ficus-lyrata' },
  { id: 'monstera', name: 'Monstera', latin: 'Monstera deliciosa', h: 120, pot: 24, light: ['medium'], humid: ['normaal', 'vochtig'], care: 1, size: 'M', img: img('1545241047-6083a3684587'), shopifyHandle: 'monstera' },
  { id: 'strelitzia', name: 'Strelitzia', latin: 'Strelitzia nicolai', h: 170, pot: 26, light: ['hoog'], humid: ['normaal'], care: 2, size: 'L', img: img('1524758631624-e2822e304c36'), shopifyHandle: 'strelitzia' },
  { id: 'dracaena', name: 'Dracaena', latin: "'Janet Craig'", h: 140, pot: 24, light: ['laag', 'medium'], humid: ['droog', 'normaal'], care: 1, size: 'L', img: img('1518531933037-91b2f5f229cc'), shopifyHandle: 'dracaena' },
  { id: 'spathiphyllum', name: 'Lepelplant', latin: 'Spathiphyllum', h: 70, pot: 19, light: ['laag', 'medium'], humid: ['normaal', 'vochtig'], care: 1, size: 'S', img: img('1485955900006-10f4d324d411'), shopifyHandle: 'spathiphyllum' },
  { id: 'chamaedorea', name: 'Bergpalm', latin: 'Chamaedorea elegans', h: 110, pot: 21, light: ['laag', 'medium'], humid: ['normaal', 'vochtig'], care: 2, size: 'M', img: img('1463320726281-696a485928c7'), shopifyHandle: 'chamaedorea' },
  { id: 'philodendron', name: 'Philodendron', latin: 'Ph. scandens', h: 50, pot: 17, light: ['laag', 'medium'], humid: ['normaal', 'vochtig'], care: 1, size: 'S', img: img('1497250681960-ef046c08a56e'), shopifyHandle: 'philodendron' },
  { id: 'calathea', name: 'Calathea', latin: 'C. orbifolia', h: 60, pot: 19, light: ['medium'], humid: ['vochtig'], care: 3, size: 'S', img: img('1509423350716-97f9360b4e09'), shopifyHandle: 'calathea' },
  { id: 'yucca', name: 'Yucca', latin: 'Yucca elephantipes', h: 150, pot: 26, light: ['hoog'], humid: ['droog', 'normaal'], care: 1, size: 'L', img: img('1493663284031-b7e3aefcae8e'), shopifyHandle: 'yucca' },
]

export type CfgPotLine = { id: string; name: string; note: string; colors: [string, string][] }

export const CFG_POTS: CfgPotLine[] = [
  { id: 'mat', name: 'Mat keramiek', note: 'Tijdloos, zacht oppervlak', colors: [['Crème', '#F2EDDF'], ['Salie', '#B8C4AC'], ['Terracotta', '#C97F5E'], ['Antraciet', '#3A3D3B']] },
  { id: 'ribbel', name: 'Structuur & ribbel', note: 'Met reliëf, warm en ambachtelijk', colors: [['Zand', '#E3D7BF'], ['Mos', '#7E8B6F'], ['Roest', '#A85E3F']] },
  { id: 'metaal', name: 'Metaal-look', note: 'Strak, voor moderne kantoren', colors: [['Tin', '#9DA3A6'], ['Brons', '#7A6A55'], ['Zwart staal', '#2B2D2E']] },
]

export const CFG_STEPS = ['Jouw ruimte', 'Planten', 'Potten', 'Overzicht'] as const

export type CfgOption = { v: string | number; t: string; d: string; badge?: string }
export type CfgQuestion = { key: 'light' | 'humid' | 'care' | 'size'; title: string; sub: string; opts: CfgOption[] }

export const CFG_Q: CfgQuestion[] = [
  {
    key: 'light', title: 'Hoeveel licht valt er binnen?', sub: 'Kijk naar de plek waar de planten komen, niet naar het raam zelf.',
    opts: [
      { v: 'hoog', t: 'Veel direct licht', d: 'Grote ramen op zuid, vlak bij het glas' },
      { v: 'medium', t: 'Licht, maar gefilterd', d: 'Heldere ruimte, niet pal in de zon' },
      { v: 'laag', t: 'Eerder donker', d: 'Verder van het raam, gangen, noordkant' },
    ],
  },
  {
    key: 'humid', title: 'Hoe is de lucht in de ruimte?', sub: 'Airco en verwarming drogen de lucht sterk uit.',
    opts: [
      { v: 'droog', t: 'Droog', d: 'Airco of stevige verwarming draait vaak' },
      { v: 'normaal', t: 'Normaal', d: 'Gewoon binnenklimaat' },
      { v: 'vochtig', t: 'Vochtig', d: 'Atrium, sanitair, veel verluchting' },
    ],
  },
  {
    key: 'care', title: 'Hoeveel zorg mag de plant vragen?', sub: 'Met een onderhoudscontract nemen wij dit volledig over.',
    opts: [
      { v: 1, t: 'Zo makkelijk mogelijk', d: 'Sterk, vergeeft een gemiste waterbeurt' },
      { v: 2, t: 'Een beetje zorg mag', d: 'Iemand houdt er wekelijks een oog op' },
      { v: 3, t: 'Wij kiezen onderhoud door Stera', d: 'Alles kan — wij komen langs', badge: 'Aangeraden' },
    ],
  },
  {
    key: 'size', title: 'Hoe groot mogen de planten zijn?', sub: 'Je kan dit per plant nog verfijnen in het voorstel.',
    opts: [
      { v: 'S', t: 'Compact', d: 'Tot ± 80 cm — bureaus, balies, vensterbanken' },
      { v: 'M', t: 'Middelgroot', d: '80 – 150 cm — accenten in de ruimte' },
      { v: 'L', t: 'Groot', d: '150 cm + — blikvangers en zonering' },
    ],
  },
]
