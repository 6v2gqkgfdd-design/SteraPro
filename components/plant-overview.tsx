import AnimatedPlant, { type PlantMood } from './animated-plant'

export type PlantOverviewPlant = {
  id: string
  qr_slug: string | null
  nickname: string | null
  plant_code: string | null
  reference_code: string | null
  species: string | null
  status: string | null
  notes: string | null
  photo_url: string | null
  location_id: string | null
  is_dead: boolean | null
  is_dying: boolean | null
  needs_replacement: boolean | null
}

export type PlantOverviewLocation = {
  id: string
  name: string | null
  street?: string | null
  number?: string | null
  postal_code?: string | null
  city?: string | null
  country?: string | null
} | null

export type PlantOverviewRoom = {
  id: string
  name: string | null
  floor: string | null
} | null

export type PlantOverviewLog = {
  performed_at: string
  watered: boolean | null
  pruned: boolean | null
  dusted: boolean | null
  rotated: boolean | null
  fed: boolean | null
  pest_treated: boolean | null
  repotted: boolean | null
  soil_refreshed: boolean | null
  polished: boolean | null
  notes: string | null
} | null

const TASK_LABELS: Array<{ key: keyof NonNullable<PlantOverviewLog>; label: string }> = [
  { key: 'watered', label: 'Water' },
  { key: 'pruned', label: 'Gesnoeid' },
  { key: 'dusted', label: 'Stofvrij' },
  { key: 'rotated', label: 'Gedraaid' },
  { key: 'fed', label: 'Voeding' },
  { key: 'pest_treated', label: 'Plagen' },
  { key: 'repotted', label: 'Verpot' },
  { key: 'soil_refreshed', label: 'Verse aarde' },
  { key: 'polished', label: 'Opgeblonken' },
]

export function plantTitle(plant: PlantOverviewPlant): string {
  return (
    plant.nickname ||
    plant.species ||
    plant.plant_code ||
    plant.reference_code ||
    'Plant'
  )
}

export function getMood(plant: PlantOverviewPlant): PlantMood {
  if (plant.is_dead || plant.status === 'dead') return 'dead'
  if (plant.is_dying || plant.status === 'replacement_needed') return 'dying'
  if (
    plant.needs_replacement ||
    plant.status === 'needs_attention' ||
    plant.status === 'maintenance_due'
  ) {
    return 'needs-attention'
  }
  return 'healthy'
}

export function moodMessage(mood: PlantMood, name: string): string {
  switch (mood) {
    case 'healthy':
      return `${name} voelt zich kiplekker.`
    case 'needs-attention':
      return `${name} kan wat extra aandacht gebruiken.`
    case 'dying':
      return `${name} heeft het moeilijk en heeft snel hulp nodig.`
    case 'dead':
      return `${name} heeft het laatste blaadje gegeven.`
  }
}

export function statusLabel(plant: PlantOverviewPlant): string {
  switch (getMood(plant)) {
    case 'dead':
      return 'Plant is dood'
    case 'dying':
      return 'Plant is stervend'
    case 'needs-attention':
      return 'Vraagt aandacht'
    case 'healthy':
      return 'Gezond'
  }
}

export function statusColor(plant: PlantOverviewPlant): string {
  switch (getMood(plant)) {
    case 'dead':
      return 'bg-red-100 text-red-800 border-red-300'
    case 'dying':
      return 'bg-orange-100 text-orange-800 border-orange-300'
    case 'needs-attention':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    case 'healthy':
      return 'bg-stera-blue/10 text-stera-blue border-stera-blue/30'
  }
}

export default function PlantOverview({
  plant,
  location,
  room,
  latestLog,
  actions,
}: {
  plant: PlantOverviewPlant
  location: PlantOverviewLocation
  room?: PlantOverviewRoom
  latestLog: PlantOverviewLog
  actions?: React.ReactNode
}) {
  const title = plantTitle(plant)
  const mood = getMood(plant)
  const performedTasks = latestLog
    ? TASK_LABELS.filter(({ key }) => latestLog[key])
    : []

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex flex-col items-center text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
        <div className="w-48 sm:w-56 shrink-0">
          <AnimatedPlant mood={mood} />
        </div>
        <div className="mt-4 sm:mt-0">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {title}
          </h1>
          {plant.species && plant.species !== title && (
            <p className="mt-1 text-base text-stera-ink-soft">{plant.species}</p>
          )}
          <p className="mt-3 text-sm text-stera-ink">
            {moodMessage(mood, title)}
          </p>
          <div
            className={`mt-3 inline-flex items-center border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusColor(plant)}`}
          >
            {statusLabel(plant)}
          </div>
        </div>
      </div>

      {plant.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={plant.photo_url}
          alt={title}
          className="mt-4 w-full max-h-[420px] object-cover border border-stera-line"
        />
      )}

      <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 border-t border-stera-line pt-6">
        {plant.reference_code && (
          <div>
            <dt className="stera-eyebrow text-stera-ink-soft">Referentie</dt>
            <dd className="mt-1 text-sm text-stera-ink font-mono">
              {plant.reference_code}
            </dd>
          </div>
        )}
        {plant.plant_code && plant.plant_code !== plant.reference_code && (
          <div>
            <dt className="stera-eyebrow text-stera-ink-soft">Plantcode</dt>
            <dd className="mt-1 text-sm text-stera-ink font-mono">
              {plant.plant_code}
            </dd>
          </div>
        )}
        {location?.name && (
          <div>
            <dt className="stera-eyebrow text-stera-ink-soft">Locatie</dt>
            <dd className="mt-1 text-sm text-stera-ink">
              {location.name}
              {(location.street || location.city) && (
                <span className="block text-stera-ink-soft">
                  {[
                    [location.street, location.number].filter(Boolean).join(' '),
                    [location.postal_code, location.city]
                      .filter(Boolean)
                      .join(' '),
                  ]
                    .filter((p) => typeof p === 'string' && p.trim().length > 0)
                    .join(', ')}
                </span>
              )}
            </dd>
          </div>
        )}

        {room?.name && (
          <div>
            <dt className="stera-eyebrow text-stera-ink-soft">Ruimte</dt>
            <dd className="mt-1 text-sm text-stera-ink">
              {room.name}
              {room.floor && (
                <span className="text-stera-ink-soft"> · {room.floor}</span>
              )}
            </dd>
          </div>
        )}
        {plant.status && (
          <div>
            <dt className="stera-eyebrow text-stera-ink-soft">Conditie</dt>
            <dd className="mt-1 text-sm text-stera-ink">{plant.status}</dd>
          </div>
        )}
      </dl>

      {plant.notes && (
        <section className="mt-8 border border-stera-line bg-white p-5 sm:p-6">
          <h2 className="stera-eyebrow text-stera-blue mb-3">Notities</h2>
          <p className="text-sm text-stera-ink leading-relaxed whitespace-pre-wrap">
            {plant.notes}
          </p>
        </section>
      )}

      <section className="mt-8 border border-stera-line bg-white p-5 sm:p-6">
        <h2 className="stera-eyebrow text-stera-blue mb-3">Laatste onderhoud</h2>
        {latestLog ? (
          <>
            <p className="text-sm text-stera-ink-soft">
              {new Date(latestLog.performed_at).toLocaleString('nl-BE', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </p>
            {performedTasks.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {performedTasks.map(({ key, label }) => (
                  <span
                    key={key}
                    className="border border-stera-line px-2 py-1 uppercase tracking-wider"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-stera-ink-soft">
                Geen specifieke handelingen geregistreerd.
              </p>
            )}
            {latestLog.notes && (
              <p className="mt-4 text-sm text-stera-ink-soft leading-relaxed whitespace-pre-wrap">
                {latestLog.notes}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-stera-ink-soft">
            Nog geen onderhoud geregistreerd voor deze plant.
          </p>
        )}
      </section>

      {actions ? (
        <div className="mt-10 flex flex-col sm:flex-row flex-wrap gap-3">
          {actions}
        </div>
      ) : null}

      {plant.qr_slug ? (
        <p className="mt-8 text-xs text-stera-ink-soft">
          QR-slug:{' '}
          <span className="font-mono break-all">{plant.qr_slug}</span>
        </p>
      ) : null}
    </div>
  )
}
