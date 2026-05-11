import type { WeatherKind, WeatherSummary } from '@/lib/weather'

const ICON: Record<WeatherKind, string> = {
  clear: '☀️',
  'partly-cloudy': '⛅',
  cloudy: '☁️',
  fog: '🌫️',
  drizzle: '🌦️',
  rain: '🌧️',
  snow: '❄️',
  thunderstorm: '⛈️',
}

export default function WeatherPill({ weather }: { weather: WeatherSummary }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-stera-line bg-white/70 px-3 py-1.5 text-sm text-stera-ink">
      <span aria-hidden>{ICON[weather.kind] ?? '☀️'}</span>
      <span className="text-stera-ink">{weather.label}</span>
      <span className="font-medium">{weather.current}°</span>
    </span>
  )
}
