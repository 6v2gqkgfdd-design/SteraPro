import type { WeatherKind, WeatherSummary } from '@/lib/weather'

function WeatherIcon({ kind }: { kind: WeatherKind }) {
  // Kleine inline SVG icoontjes in stera-groen
  const stroke = 'currentColor'
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (kind) {
    case 'clear':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </svg>
      )
    case 'partly-cloudy':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3" />
          <path d="M9 3v1.5M3 9h1.5M14 5l1-1M5 14l-1 1" />
          <path d="M16 18a4 4 0 0 0-7.5-1.5A3 3 0 0 0 9 22h7a3 3 0 0 0 0-6 .9.9 0 0 0-.1 0Z" />
        </svg>
      )
    case 'cloudy':
      return (
        <svg {...common}>
          <path d="M7 18a4.5 4.5 0 0 1 .8-9 5.5 5.5 0 0 1 10.6 1.5A4 4 0 0 1 18 18Z" />
        </svg>
      )
    case 'fog':
      return (
        <svg {...common}>
          <path d="M5 9h14M3 13h18M5 17h14" />
        </svg>
      )
    case 'drizzle':
      return (
        <svg {...common}>
          <path d="M7 14a4.5 4.5 0 0 1 .8-9 5.5 5.5 0 0 1 10.6 1.5A4 4 0 0 1 18 14Z" />
          <path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" />
        </svg>
      )
    case 'rain':
      return (
        <svg {...common}>
          <path d="M7 14a4.5 4.5 0 0 1 .8-9 5.5 5.5 0 0 1 10.6 1.5A4 4 0 0 1 18 14Z" />
          <path d="M9 17v3M13 17v3M17 17v3" />
        </svg>
      )
    case 'snow':
      return (
        <svg {...common}>
          <path d="M7 14a4.5 4.5 0 0 1 .8-9 5.5 5.5 0 0 1 10.6 1.5A4 4 0 0 1 18 14Z" />
          <path d="M9 18.5v.01M9 21v.01M13 18.5v.01M13 21v.01M17 18.5v.01M17 21v.01" />
        </svg>
      )
    case 'thunderstorm':
      return (
        <svg {...common}>
          <path d="M7 14a4.5 4.5 0 0 1 .8-9 5.5 5.5 0 0 1 10.6 1.5A4 4 0 0 1 18 14Z" />
          <path d="M11 15l-2 4h3l-2 4" />
        </svg>
      )
    default:
      return null
  }
}

export default function WeatherPill({ weather }: { weather: WeatherSummary }) {
  return (
    <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-stera-line bg-white/70 px-3 py-1.5 text-sm text-stera-ink">
      <span className="text-stera-green">
        <WeatherIcon kind={weather.kind} />
      </span>
      <span>
        <span className="font-medium">{weather.label}</span>
        <span className="text-stera-ink-soft"> · nu {weather.current}°</span>
        <span className="text-stera-ink-soft">
          {' '}
          ({weather.min}° / {weather.max}°)
        </span>
      </span>
    </span>
  )
}
