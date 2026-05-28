import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { findPotSize } from '@/lib/pot-sizes'
import PrintButton from './print-button'

const LIGHT_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'Zon',
  medium: 'Half-schaduw',
  low: 'Schaduw',
}

const CARE_LABEL: Record<'easy' | 'hard', string> = {
  easy: 'Makkelijk in onderhoud',
  hard: 'Mag moeilijker',
}

function one<T>(value: T[] | T | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Geeft een gecomprimeerde versie van een foto via Next.js' eigen
// image-optimizer. Werkbon-photos die op de telefoon werden gemaakt
// kunnen anders meerdere MB zijn.
function thumb(url: string | null | undefined, w = 480): string | null {
  if (!url) return null
  if (url.startsWith('data:')) return url
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle()
  const name = (company?.name as string | undefined) || 'klant'
  return {
    title: { absolute: `Vervangingen — ${name}` },
  }
}

export default async function ReplacementsPrintPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: company }, { data: rows }] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .maybeSingle(),
    supabase
      .from('maintenance_visit_plants')
      .select(
        `
        id, photo_url, created_at,
        replacement_light_level, replacement_height_cm,
        replacement_pot_diameter_cm, replacement_is_hanging,
        replacement_care_level, replacement_notes,
        plants ( nickname, species, reference_code, pot_size_code ),
        maintenance_visits!inner (
          id, scheduled_start, ended_at, company_id,
          locations ( name )
        )
      `
      )
      .eq('followup_replace', true)
      .eq('maintenance_visits.company_id', companyId)
      .order('created_at', { ascending: false }),
  ])

  if (!company) notFound()

  type Row = Record<string, unknown>
  const plants = (rows ?? []) as Row[]
  const companyName = (company.name as string | null) || 'Klant'

  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink print:bg-white">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-10 sm:py-12 print:px-0 print:py-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-stera-line pb-4 print:hidden">
          <Link href="/quotes" className="text-sm underline">
            ← Terug naar offertes
          </Link>
          <PrintButton />
        </div>

        <header className="mb-8">
          <p className="stera-eyebrow text-stera-green mb-2">
            Te vervangen planten
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {companyName}
          </h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            {plants.length} plant{plants.length === 1 ? '' : 'en'} gemarkeerd
            voor vervanging.
          </p>
        </header>

        {plants.length === 0 ? (
          <p className="text-sm text-stera-ink-soft">
            Geen te vervangen planten gevonden voor deze klant.
          </p>
        ) : (
          <ul className="space-y-5">
            {plants.map((r) => {
              const plant = one(r.plants) as {
                nickname?: string | null
                species?: string | null
                reference_code?: string | null
                pot_size_code?: string | null
              } | null
              const visit = one(r.maintenance_visits) as {
                scheduled_start?: string | null
                ended_at?: string | null
                locations?: unknown
              } | null
              const location = one(visit?.locations) as {
                name?: string | null
              } | null
              const photoSrc =
                thumb(r.photo_url as string | null) ||
                ((r.photo_url as string | null) ?? null)
              const lightRaw = r.replacement_light_level
              const light =
                lightRaw === 'high' ||
                lightRaw === 'medium' ||
                lightRaw === 'low'
                  ? lightRaw
                  : null
              const careRaw = r.replacement_care_level
              const care =
                careRaw === 'easy' || careRaw === 'hard' ? careRaw : null
              const potSize = findPotSize(plant?.pot_size_code ?? null)
              const currentPot = potSize
                ? potSize.minDiameter === potSize.maxDiameter
                  ? `Ø ${potSize.minDiameter} cm`
                  : `Ø ${potSize.minDiameter}–${potSize.maxDiameter} cm`
                : null

              const conditions: Array<[string, string]> = []
              if (light) conditions.push(['Licht', LIGHT_LABEL[light]])
              if (
                typeof r.replacement_height_cm === 'number' &&
                r.replacement_height_cm > 0
              ) {
                conditions.push(['Hoogte', `± ${r.replacement_height_cm} cm`])
              }
              if (
                typeof r.replacement_pot_diameter_cm === 'number' &&
                r.replacement_pot_diameter_cm > 0
              ) {
                conditions.push([
                  'Binnenpot',
                  `Ø ${r.replacement_pot_diameter_cm} cm`,
                ])
              }
              if (r.replacement_is_hanging) {
                conditions.push(['Type', 'Hangplant'])
              }
              if (care) conditions.push(['Onderhoud', CARE_LABEL[care]])

              return (
                <li
                  key={r.id as string}
                  className="rounded-xl border border-stera-line bg-white p-4 print:break-inside-avoid print:bg-transparent"
                >
                  <div className="flex flex-wrap gap-4">
                    {photoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoSrc}
                        alt={
                          plant?.nickname || plant?.species || 'Plant'
                        }
                        className="h-40 w-40 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-stera-line text-xs text-stera-ink-soft">
                        Geen foto
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold">
                        {plant?.nickname ||
                          plant?.species ||
                          'Plant'}
                      </p>
                      {plant?.species && plant?.nickname ? (
                        <p className="text-sm text-stera-ink-soft">
                          {plant.species}
                        </p>
                      ) : null}
                      {plant?.reference_code ? (
                        <p className="font-mono text-xs text-stera-ink-soft">
                          {plant.reference_code}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-stera-ink-soft">
                        {location?.name ? `${location.name} · ` : ''}
                        Onderhoud{' '}
                        {formatDate(
                          (visit?.ended_at as string | null) ||
                            (visit?.scheduled_start as string | null)
                        )}
                      </p>

                      {(currentPot || conditions.length > 0) && (
                        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                          {currentPot ? (
                            <div>
                              <dt className="text-xs text-stera-ink-soft">
                                Huidige pot
                              </dt>
                              <dd>{currentPot}</dd>
                            </div>
                          ) : null}
                          {conditions.map(([k, v]) => (
                            <div key={k}>
                              <dt className="text-xs text-stera-ink-soft">
                                {k}
                              </dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      )}

                      {r.replacement_notes ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm">
                          <span className="text-xs text-stera-ink-soft">
                            Notitie:{' '}
                          </span>
                          {r.replacement_notes as string}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <footer className="mt-12 border-t border-stera-line pt-6 text-xs text-stera-ink-soft">
          <p className="stera-wordmark text-stera-ink text-sm mb-1">
            Stéra<span className="text-stera-green">Pro</span>
          </p>
          <p>Vervangingsoverzicht — hulpmiddel om handmatig een offerte op te maken.</p>
        </footer>
      </div>
    </main>
  )
}
