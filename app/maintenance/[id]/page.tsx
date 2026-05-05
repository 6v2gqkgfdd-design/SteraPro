import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import MaintenanceActions from './maintenance-actions'
import VisitConsumables from './visit-consumables'

type FollowupItem = {
  plantId: string
  plantName: string
  flags: {
    repot: boolean
    prune: boolean
    replace: boolean
    treat: boolean
  }
  notes: string | null
}

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: visit, error } = await supabase
    .from('maintenance_visits')
    .select(`
      *,
      locations (
        id,
        name
      )
    `)
    .eq('id', id)
    .single()

  const { data: visitPlants } = await supabase
    .from('maintenance_visit_plants')
    .select(`
      *,
      plants (
        id,
        nickname,
        species,
        reference_code
      )
    `)
    .eq('visit_id', id)
    .order('created_at', { ascending: true })

  if (error || !visit) {
    return (
      <main className="p-6">
        <p className="text-red-600">Onderhoudsbeurt niet gevonden.</p>
      </main>
    )
  }

  // ── Voorbereidingslijst: zoek de meest recente AFGESLOTEN beurt op
  // dezelfde locatie vóór deze beurt en aggregeer alle follow-up flags
  // die de techn. tijdens die beurt heeft aangevinkt.
  let followupItems: FollowupItem[] = []
  let followupSourceDate: string | null = null

  const isOpenVisit = visit.status !== 'completed'

  if (isOpenVisit && visit.location_id) {
    const cutoff = visit.scheduled_start || visit.created_at
    const { data: previousVisit } = await supabase
      .from('maintenance_visits')
      .select('id, ended_at, scheduled_start')
      .eq('location_id', visit.location_id)
      .eq('status', 'completed')
      .lt('scheduled_start', cutoff)
      .order('scheduled_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (previousVisit?.id) {
      followupSourceDate = previousVisit.ended_at || previousVisit.scheduled_start
      const { data: previousVisitPlants } = await supabase
        .from('maintenance_visit_plants')
        .select(
          `id, plant_id, followup_repot, followup_prune, followup_replace,
           followup_treat, followup_notes,
           plants ( id, nickname, species, reference_code )`
        )
        .eq('visit_id', previousVisit.id)

      followupItems = (previousVisitPlants ?? [])
        .filter(
          (row: any) =>
            row.followup_repot ||
            row.followup_prune ||
            row.followup_replace ||
            row.followup_treat ||
            (row.followup_notes && row.followup_notes.trim())
        )
        .map((row: any) => {
          const plant = Array.isArray(row.plants) ? row.plants[0] : row.plants
          const plantName =
            plant?.nickname ||
            plant?.species ||
            plant?.reference_code ||
            'Plant'
          return {
            plantId: row.plant_id,
            plantName,
            flags: {
              repot: Boolean(row.followup_repot),
              prune: Boolean(row.followup_prune),
              replace: Boolean(row.followup_replace),
              treat: Boolean(row.followup_treat),
            },
            notes: row.followup_notes || null,
          } as FollowupItem
        })
    }
  }

  const followupCounts = followupItems.reduce(
    (acc, item) => {
      if (item.flags.repot) acc.repot += 1
      if (item.flags.prune) acc.prune += 1
      if (item.flags.replace) acc.replace += 1
      if (item.flags.treat) acc.treat += 1
      return acc
    },
    { repot: 0, prune: 0, replace: 0, treat: 0 }
  )

  const benodigdheden: { label: string; count: number }[] = []
  if (followupCounts.repot > 0)
    benodigdheden.push({
      label: `${followupCounts.repot}× verpotten — potten · verpotaarde · onderzetters`,
      count: followupCounts.repot,
    })
  if (followupCounts.prune > 0)
    benodigdheden.push({
      label: `${followupCounts.prune}× snoeien — snoeischaar · handschoenen`,
      count: followupCounts.prune,
    })
  if (followupCounts.replace > 0)
    benodigdheden.push({
      label: `${followupCounts.replace}× vervanging — nieuwe plant of stek`,
      count: followupCounts.replace,
    })
  if (followupCounts.treat > 0)
    benodigdheden.push({
      label: `${followupCounts.treat}× behandeling — verzorgingsmiddel`,
      count: followupCounts.treat,
    })

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="stera-eyebrow mb-2">Onderhoud</p>
            <h1 className="stera-display text-3xl sm:text-4xl">{visit.title}</h1>
            <p className="mt-2 text-sm text-stera-ink-soft">
              {visit.locations?.name ?? 'Onbekende locatie'} •{' '}
              {visit.scheduled_start
                ? new Date(visit.scheduled_start).toLocaleString('nl-BE')
                : 'Geen datum'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/maintenance/${id}/report`}
              className="stera-cta stera-cta-primary"
            >
              Klantrapport
            </Link>

            <Link
              href="/maintenance"
              className="stera-cta stera-cta-ghost"
            >
              Overzicht
            </Link>

            </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="stera-card">
            <p className="stera-eyebrow mb-2">Vorige keer</p>
            <p className="whitespace-pre-wrap text-sm text-stera-ink-soft">
              {visit.previous_visit_summary || 'Geen vorige samenvatting beschikbaar.'}
            </p>
          </div>

          <div className="stera-card">
            <p className="stera-eyebrow mb-2">Vandaag te doen</p>
            <p className="whitespace-pre-wrap text-sm text-stera-ink-soft">
              {visit.planned_tasks || 'Geen geplande taken ingevuld.'}
            </p>
          </div>
        </div>

        {isOpenVisit && followupItems.length > 0 && (
          <div className="stera-card border-stera-green/40 bg-stera-cream-deep/40">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="stera-eyebrow">Voorbereiding</p>
              {followupSourceDate ? (
                <p className="text-xs text-stera-ink-soft">
                  Op basis van vorige beurt op{' '}
                  {new Date(followupSourceDate).toLocaleDateString('nl-BE')}
                </p>
              ) : null}
            </div>

            {benodigdheden.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-semibold text-stera-ink">
                  Benodigdheden mee te nemen
                </p>
                <ul className="space-y-1.5 text-sm text-stera-ink">
                  {benodigdheden.map((b) => (
                    <li key={b.label} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-stera-green" />
                      <span>{b.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mb-2 text-sm font-semibold text-stera-ink">
              Per plant
            </p>
            <ul className="space-y-2 text-sm">
              {followupItems.map((item) => {
                const tags: string[] = []
                if (item.flags.repot) tags.push('verpotten')
                if (item.flags.prune) tags.push('snoeien')
                if (item.flags.replace) tags.push('vervangen')
                if (item.flags.treat) tags.push('behandelen')
                return (
                  <li
                    key={item.plantId}
                    className="rounded-lg border border-stera-line bg-white p-3"
                  >
                    <p className="font-medium text-stera-ink">
                      {item.plantName}
                    </p>
                    {tags.length > 0 ? (
                      <p className="mt-1 text-xs uppercase tracking-wider text-stera-green">
                        {tags.join(' · ')}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-stera-ink-soft">
                        {item.notes}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="stera-card">
          <p className="stera-eyebrow mb-3">Tijdsregistratie</p>
          <MaintenanceActions visit={visit} />
        </div>

        <div className="stera-card">
          <VisitConsumables visitId={visit.id} />
        </div>

        <div className="stera-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="stera-eyebrow">Behandelde planten</p>

            <Link
              href={`/maintenance/${id}/plants`}
              className="stera-cta stera-cta-primary"
            >
              Plant toevoegen / scannen
            </Link>
          </div>

          <div className="space-y-3">
            {visitPlants?.map((item: any) => (
              <Link
                key={item.id}
                href={`/maintenance/${id}/plants/${item.plant_id}`}
                className="flex flex-wrap gap-3 rounded-lg border border-stera-line bg-stera-cream-deep p-3 transition hover:border-stera-green"
              >
                {item.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photo_url}
                    alt="Foto van plant tijdens onderhoud"
                    className="h-20 w-20 shrink-0 rounded object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.plants?.nickname || 'Plant'}
                  </p>
                  <p className="text-sm text-stera-ink-soft">
                    {item.plants?.species || 'Onbekende soort'} • {item.plants?.reference_code}
                  </p>
                  {item.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-stera-ink-soft">
                      {item.notes}
                    </p>
                  ) : null}
                </div>
              </Link>
            ))}

            {!visitPlants?.length && (
              <p className="text-sm text-stera-ink-soft">
                Nog geen planten toegevoegd aan deze onderhoudsbeurt.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
