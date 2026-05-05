/**
 * Server-side weersverwachting voor het home-scherm.
 *
 * Bron: Open-Meteo (https://open-meteo.com) — gratis, geen API key.
 * Resultaat wordt 30 minuten gecached zodat we niet bij elke render
 * de externe API tikken.
 *
 * Voor v1 gebruiken we één centrale lat/lon (regio centraal België).
 * Later kunnen we per klant-locatie geocoden en dan de coördinaten
 * van het eerste afgesproken onderhoud van vandaag gebruiken.
 */

export type WeatherKind =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm'

export type WeatherSummary = {
  kind: WeatherKind
  label: string
  current: number
  min: number
  max: number
}

const DEFAULT_LATITUDE = 50.85
const DEFAULT_LONGITUDE = 4.35
const TIMEZONE = 'Europe/Brussels'

function classify(code: number): { kind: WeatherKind; label: string } {
  // WMO weather codes — zie https://open-meteo.com/en/docs
  if (code === 0) return { kind: 'clear', label: 'Zonnig' }
  if (code === 1) return { kind: 'clear', label: 'Vrijwel onbewolkt' }
  if (code === 2) return { kind: 'partly-cloudy', label: 'Half bewolkt' }
  if (code === 3) return { kind: 'cloudy', label: 'Bewolkt' }
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Mistig' }
  if (code >= 51 && code <= 57) return { kind: 'drizzle', label: 'Motregen' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { kind: 'rain', label: 'Regen' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { kind: 'snow', label: 'Sneeuw' }
  if (code >= 95) return { kind: 'thunderstorm', label: 'Onweer' }
  return { kind: 'cloudy', label: 'Bewolkt' }
}

export async function getTodaysWeather(
  latitude: number = DEFAULT_LATITUDE,
  longitude: number = DEFAULT_LONGITUDE
): Promise<WeatherSummary | null> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('current_weather', 'true')
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,weathercode'
  )
  url.searchParams.set('timezone', TIMEZONE)
  url.searchParams.set('forecast_days', '1')

  try {
    const res = await fetch(url.toString(), {
      // Cache 30 min op de Next.js server zodat we niet rate-gelimited worden
      next: { revalidate: 1800 },
    })

    if (!res.ok) return null

    const data: any = await res.json()

    const code: number =
      data?.current_weather?.weathercode ??
      data?.daily?.weathercode?.[0] ??
      -1

    if (code < 0) return null

    const { kind, label } = classify(code)

    return {
      kind,
      label,
      current: Math.round(Number(data?.current_weather?.temperature ?? 0)),
      min: Math.round(Number(data?.daily?.temperature_2m_min?.[0] ?? 0)),
      max: Math.round(Number(data?.daily?.temperature_2m_max?.[0] ?? 0)),
    }
  } catch {
    return null
  }
}
