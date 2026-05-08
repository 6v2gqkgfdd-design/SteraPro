/**
 * Speelse Nederlandse bijnamen voor kamerplanten.
 *
 * Deze module heeft twee delen:
 *   1. Een grote lijst Vlaamse voornamen × plant-thematische woorden
 *      die we gebruiken als fallback wanneer de AI-bijnaam niet
 *      beschikbaar is (rate limit, geen API key, ...).
 *   2. Helpers die een willekeurige bijnaam kiezen en — optioneel —
 *      bestaande bijnamen vermijden.
 *
 * Voor variëteit werken we met meerdere patronen:
 *   "Bertha de Banaanplant"     (voornaam + lidwoord + plantwoord)
 *   "Roger Rubber"              (voornaam + alliteratie)
 *   "Madame Klimop"             (titel + plantwoord)
 *   "Sieger het Suikerriet"     (voornaam + lidwoord + plantwoord)
 */

const FIRST_NAMES = [
  'Adel', 'Albrecht', 'Aline', 'Amber', 'Anneke', 'Arthur', 'Astrid', 'August',
  'Bart', 'Bea', 'Benoit', 'Bernadette', 'Bertha', 'Bjorn', 'Bram', 'Brigitte',
  'Camiel', 'Carla', 'Cato', 'Cecile', 'Christiaan', 'Cleo', 'Cyriel',
  'Daan', 'Dirk', 'Dorien', 'Eddy', 'Edith', 'Egied', 'Elke', 'Emiel', 'Estelle',
  'Eveline', 'Fanny', 'Fien', 'Filip', 'Flore', 'Frans', 'Frederik',
  'Gaston', 'Gerda', 'Gilbert', 'Gitte', 'Godelieve', 'Greta', 'Guido', 'Gust',
  'Hannelore', 'Helga', 'Henri', 'Hilde', 'Hubert', 'Hugo',
  'Ignace', 'Ilse', 'Ingrid', 'Iris', 'Isolde', 'Ivan', 'Ivo',
  'Jacqueline', 'Jan', 'Jasmine', 'Jef', 'Joke', 'Joris', 'Josee', 'Julien',
  'Karel', 'Karien', 'Kasper', 'Kim', 'Klaartje', 'Koen', 'Kristel',
  'Laura', 'Leen', 'Leentje', 'Leonard', 'Lien', 'Lieve', 'Lina', 'Lode', 'Lutgart',
  'Maaike', 'Maarten', 'Madeleine', 'Margot', 'Marleen', 'Mathilde', 'Mia', 'Mireille', 'Moniek',
  'Nadia', 'Nele', 'Nicole', 'Niels', 'Norbert',
  'Octave', 'Odette', 'Oscar', 'Otto',
  'Patrick', 'Petra', 'Piet', 'Pol',
  'Raf', 'Roeland', 'Roger', 'Romain', 'Roos', 'Rudi',
  'Saartje', 'Sieger', 'Simonne', 'Sofie', 'Stan', 'Stien', 'Suzanne', 'Sylvain',
  'Tessa', 'Theo', 'Tilly', 'Tom', 'Tristan',
  'Ulla', 'Ursula',
  'Vera', 'Vicky', 'Viktor',
  'Walter', 'Wendy', 'Wim',
  'Xenia',
  'Yvon',
  'Zoë',
]

// "Plantachtige" woorden — soms specifiek (Bonsai, Olijf), soms algemeen
// (Loof, Wortel) zodat ze met om het even welke plant kunnen werken.
const PLANT_WORDS = [
  'Banaan', 'Bonsai', 'Cactus', 'Drakenboom', 'Eikenblad', 'Esdoorn', 'Fern',
  'Grasspriet', 'Hortensia', 'Ivy', 'Jasmijn', 'Klimop', 'Kruidje', 'Loof',
  'Magnolia', 'Mos', 'Mosroos', 'Naaldboom', 'Olijf', 'Orchidee', 'Palm',
  'Pluk', 'Reuzenblad', 'Rubber', 'Sappige', 'Schorsje', 'Sierboom', 'Stam',
  'Stengel', 'Steppe', 'Suikerriet', 'Tak', 'Twijg', 'Varen', 'Wingerd',
  'Wortel', 'Zaadje', 'Zonnedauw', 'Zuilcactus',
]

// Korte, charmante "lidwoord"-tussenstukken
const CONNECTORS = [
  'de', 'het', 'van de', 'van het',
]

// Voor occasionele varianten zonder lidwoord ("Roger Rubber")
const TITLES = ['Madame', 'Meneer', 'Tante', 'Oom', 'Kapitein', 'Professor', 'Sieur']

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

function variant1(): string {
  // "Bertha de Banaanplant"
  return `${pick(FIRST_NAMES)} ${pick(CONNECTORS)} ${pick(PLANT_WORDS)}`
}

function variant2(): string {
  // "Roger Rubber" (kort)
  return `${pick(FIRST_NAMES)} ${pick(PLANT_WORDS)}`
}

function variant3(): string {
  // "Madame Klimop"
  return `${pick(TITLES)} ${pick(PLANT_WORDS)}`
}

const VARIANTS = [variant1, variant1, variant2, variant3] // gewogen: lidwoord-stijl wint

/**
 * Geef één willekeurige bijnaam uit de lokale lijst. Als `avoid` wordt
 * meegegeven proberen we maximaal 20 keer een naam te vinden die er
 * niet inzit (case-insensitief).
 */
export function pickLocalNickname(avoid?: Iterable<string>): string {
  const taken = new Set<string>()
  if (avoid) {
    for (const v of avoid) {
      if (typeof v === 'string' && v.trim()) {
        taken.add(v.trim().toLowerCase())
      }
    }
  }

  for (let i = 0; i < 20; i++) {
    const candidate = pick(VARIANTS)()
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  // Onwaarschijnlijk: gewoon de laatste poging teruggeven.
  return pick(VARIANTS)()
}

/**
 * Lichtgewicht client-side helper: probeert eerst de Claude-route, valt
 * terug op de lokale lijst bij ongeacht welke fout (geen key, timeout,
 * rate limit, ...). Werkt alleen aan de browser-kant.
 */
export async function fetchPlayfulNickname(opts: {
  species?: string
  avoid?: string[]
  timeoutMs?: number
}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 4000

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)

    const res = await fetch('/api/plants/nickname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        species: opts.species ?? '',
        avoid: opts.avoid ?? [],
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)

    if (res.ok) {
      const json = await res.json().catch(() => null)
      const nick = (json?.nickname ?? '').toString().trim()
      if (nick) return nick
    }
  } catch {
    // Stilletjes naar de fallback
  }

  return pickLocalNickname(opts.avoid)
}
