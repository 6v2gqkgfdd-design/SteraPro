import {
  updatePlantReportStatus,
  deletePlantReport,
} from '@/app/plants/[id]/report-actions'

export type PlantReportRow = {
  id: string
  plant_id: string
  issue_type: string
  message: string | null
  reporter_name: string | null
  reporter_email: string | null
  status: 'new' | 'seen' | 'handled'
  created_at: string | null
  handled_at: string | null
}

const ISSUE_LABELS: Record<string, string> = {
  replace: 'Plant moet vervangen worden',
  sick: 'Plant lijkt ziek',
  damaged: 'Plant is beschadigd',
  pest: 'Ongedierte / aantasting',
  other: 'Andere opmerking',
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nieuw',
  seen: 'Gezien',
  handled: 'Afgehandeld',
}

const STATUS_TONES: Record<string, string> = {
  new: 'bg-amber-50 text-amber-700',
  seen: 'bg-stera-cream-deep text-stera-ink',
  handled: 'bg-stera-green/10 text-stera-green',
}

function formatDate(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleString('nl-BE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PlantReportList({
  reports,
  showHeader = true,
}: {
  reports: PlantReportRow[]
  showHeader?: boolean
}) {
  if (!reports || reports.length === 0) {
    return null
  }

  return (
    <section className="space-y-3">
      {showHeader ? (
        <div className="flex items-baseline justify-between">
          <p className="stera-eyebrow">Meldingen van de klant</p>
        </div>
      ) : null}

      <ul className="space-y-3">
        {reports.map((r) => {
          const label = ISSUE_LABELS[r.issue_type] || r.issue_type

          return (
            <li
              key={r.id}
              className="rounded-xl border border-stera-line bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-stera-ink">{label}</p>
                  <p className="mt-1 text-xs text-stera-ink-soft">
                    {formatDate(r.created_at)}
                    {r.reporter_name ? ` · ${r.reporter_name}` : ''}
                    {r.reporter_email ? ` · ${r.reporter_email}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                    STATUS_TONES[r.status] || 'bg-stera-cream-deep'
                  }`}
                >
                  {STATUS_LABELS[r.status] || r.status}
                </span>
              </div>

              {r.message ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-stera-ink-soft">
                  {r.message}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {r.status !== 'seen' ? (
                  <form action={updatePlantReportStatus}>
                    <input type="hidden" name="report_id" value={r.id} />
                    <input type="hidden" name="status" value="seen" />
                    <input type="hidden" name="plant_id" value={r.plant_id} />
                    <button type="submit" className="stera-cta stera-cta-ghost">
                      Markeer als gezien
                    </button>
                  </form>
                ) : null}

                {r.status !== 'handled' ? (
                  <form action={updatePlantReportStatus}>
                    <input type="hidden" name="report_id" value={r.id} />
                    <input type="hidden" name="status" value="handled" />
                    <input type="hidden" name="plant_id" value={r.plant_id} />
                    <button type="submit" className="stera-cta stera-cta-secondary">
                      Afgehandeld
                    </button>
                  </form>
                ) : (
                  <form action={updatePlantReportStatus}>
                    <input type="hidden" name="report_id" value={r.id} />
                    <input type="hidden" name="status" value="new" />
                    <input type="hidden" name="plant_id" value={r.plant_id} />
                    <button type="submit" className="stera-cta stera-cta-ghost">
                      Heropenen
                    </button>
                  </form>
                )}

                <form action={deletePlantReport}>
                  <input type="hidden" name="report_id" value={r.id} />
                  <input type="hidden" name="plant_id" value={r.plant_id} />
                  <button type="submit" className="stera-cta stera-cta-danger">
                    Verwijderen
                  </button>
                </form>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
