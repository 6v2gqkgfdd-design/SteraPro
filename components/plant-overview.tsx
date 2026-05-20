import AnimatedPlant, { type PlantMood } from './animated-plant'
import { formatRoomLabel } from '@/lib/rooms'

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
  care_tips?: string | null
  is_artificial?: boolean | null
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
  { key: 'fed', label: 'Voeding' },
  { key: 'pruned', label: 'Gesnoeid' },
  { key: 'rotated', label: 'Gedraaid' },
  { key: 'dusted', label: 'Bladeren gereinigd' },
  { key: 'pest_treated', label: 'Behandeld' },
  { key: 'repotted', label: 'Verpot' },
  { key: 'soil_refreshed', label: 'Verse aarde' },
  // Bewust niet meer apart: 'polished' (bladglans) — zit nu onder 'dusted'.
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

export function moodMessage(mood: PlantMood, _name: string): string {
  switch (mood) {
    case 'healthy':
      return 'Voelt zich kiplekker.'
    case 'needs-attention':
      return 'Heeft onderhoud nodig.'
    case 'dying':
      return 'Lijkt ziek — opvolgen.'
    case 'dead':
      return 'Heeft het laatste blaadje gegeven.'
  }
}

export function statusLabel(plant: PlantOverviewPlant): string {
  // De vier officiële labels die Stera Pro gebruikt:
  //   Gezond · Onderhoud vereist · Ziek · Dood
  // Oude waarden (replacement_needed, dying-flags) worden mee omgevormd.
  if (plant.is_dead || plant.status === 'dead') return 'Dood'
  if (plant.status === 'maintenance_due') return 'Onderhoud vereist'
  if (
    plant.status === 'needs_attention' ||
    plant.status === 'replacement_needed' ||
    plant.is_dying ||
    plant.needs_replacement
  ) {
    return 'Ziek'
  }
  return 'Gezond'
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
      return 'bg-stera-green/10 text-stera-green border-stera-green/30'
  }
}

export default function PlantOverview({
  plant,
  location,
  room,
  latestLog,
  actions,
  headerMenu,
  photoUrl,
}: {
  plant: PlantOverviewPlant
  location: PlantOverviewLocation
  room?: PlantOverviewRoom
  latestLog: PlantOverviewLog
  actions?: React.ReactNode
  /** Optioneel menu rechts bovenaan (bv. 3-dot RowMenu). */
  headerMenu?: React.ReactNode
  /**
   * Foto die getoond wordt. Standaard de laatste onderhoudsfoto
   * (doorgegeven door de pagina); valt terug op plant.photo_url.
   */
  photoUrl?: string | null
}) {
  const title = plantTitle(plant)
  const mood = getMood(plant)
  const displayPhoto = photoUrl !== undefined ? photoUrl : plant.photo_url
  const performedTasks = latestLog
    ? TASK_LABELS.filter(({ key }) => latestLog[key])
    : []

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      {headerMenu ? (
        <div className="absolute right-0 top-0 z-10">{headerMenu}</div>
      ) : null}
      <div className="mb-6 flex items-center gap-3 pr-14">
        <div
          className={`w-11 shrink-0 rounded-full bg-white ring-2 ring-offset-2 ring-offset-stera-cream sm:w-14 ${
            mood === 'healthy'
              ? 'ring-stera-green'
              : mood === 'needs-attention'
                ? 'ring-amber-500'
                : mood === 'dying'
                  ? 'ring-orange-500'
                  : 'ring-red-500'
          }`}
        >
          <AnimatedPlant mood={mood} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            {title}
          </h1>
          {plant.species && plant.species !== title && (
            <p className="mt-0.5 text-sm text-stera-ink-soft">
              {plant.species}
            </p>
          )}
          <p className="mt-1 text-xs text-stera-ink-soft">
            {moodMessage(mood, title)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex items-center border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusColor(plant)}`}
            >
              {statusLabel(plant)}
            </div>
            {plant.is_artificial ? (
              <span className="inline-flex items-center rounded-full bg-stera-cream-deep px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stera-ink">
                Plastiek
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {displayPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayPhoto}
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
              {formatRoomLabel(room.name, room.floor)}
            </dd>
          </div>
        )}
      </dl>

      {plant.care_tips && plant.care_tips.trim() && (
        <section className="mt-8 border border-stera-line bg-white p-5 sm:p-6">
          <h2 className="stera-eyebrow text-stera-green mb-3">Verzorgingstips</h2>
          <p className="text-sm text-stera-ink leading-relaxed whitespace-pre-wrap">
            {plant.care_tips}
          </p>
        </section>
      )}

      {plant.notes && (
        <section className="mt-8 border border-stera-line bg-white p-5 sm:p-6">
          <h2 className="stera-eyebrow text-stera-green mb-3">Notities</h2>
          <p className="text-sm text-stera-ink leading-relaxed whitespace-pre-wrap">
            {plant.notes}
          </p>
        </section>
      )}

      <section className="mt-8 border border-stera-line bg-white p-5 sm:p-6">
        <h2 className="stera-eyebrow text-stera-green mb-3">Laatste onderhoud</h2>
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
        <div className="mt-10 flex flex-wrap justify-center gap-3 sm:justify-start">
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
