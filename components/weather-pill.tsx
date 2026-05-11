import type { WeatherSummary } from '@/lib/weather'

export default function WeatherPill({ weather }: { weather: WeatherSummary }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-stera-line bg-white/70 px-3 py-1.5 text-sm text-stera-ink">
      <span className="text-stera-ink">{weather.label}</span>
      <span className="font-medium">{weather.current}°</span>
    </span>
  )
}
