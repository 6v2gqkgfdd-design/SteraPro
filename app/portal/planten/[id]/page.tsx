import Link from 'next/link'
import { notFound } from 'next/navigation'
import PortalShell, { PageHeading, Panel, EmptyNote } from '@/components/portal-shell'
import { formatDay } from '@/lib/company-labels'
import { loadPortalPlants, plantLabel, plantPlace, plantTag } from '@/lib/portal-data'
import { demoPortalSnapshot } from '@/lib/portal-demo'
import PlantNoteForm from './note-form'

export const dynamic = 'force-dynamic'

const ISSUE: Record<string, string> = {
  replace: 'Vervangen',
  sick: 'Ziek',
  damaged: 'Beschadigd',
  pest: 'Ongedierte',
  other: 'Andere',
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadPortalPlants()
  const plant = data.rows.find((row) => row.id === id)
  if (!plant) notFound()

  const snap = data.demo ? await demoPortalSnapshot() : null
  const reports = snap?.reports.filter((report) => report.plant_id === plant.id) || []
  const tag = plantTag(plant)

  return (
    <PortalShell active="/portal/planten" company={data.companyName}>
      <PageHeading
        title={plantLabel(plant)}
        sub={[plant.species, plantPlace(plant)].filter(Boolean).join(' · ')}
      />
      <div className="mb-4">
        <Link href="/portal/planten" className="text-sm text-stera-green underline-offset-2 hover:underline">
          ← Alle planten
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Plant">
          {plant.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plant.photo_url} alt="" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-stera-cream text-sm text-stera-ink-soft">
              Geen foto
            </div>
          )}
          <div className="space-y-2 px-5 py-4 text-sm">
            <p>
              Status: <span className="font-medium text-stera-green">{tag.text}</span>
            </p>
            <p>Locatie: {plantPlace(plant)}</p>
            <p>Geplaatst: {plant.installed_at ? formatDay(plant.installed_at) : '—'}</p>
            {plant.qr_slug ? (
              <p>
                QR:{' '}
                <Link href={`/p/${plant.qr_slug}`} className="text-stera-green underline underline-offset-2">
                  open de scanpagina
                </Link>
                {' · '}
                <Link href={`/p/${plant.qr_slug}/label`} className="text-stera-green underline underline-offset-2">
                  label afdrukken
                </Link>
              </p>
            ) : null}
          </div>
        </Panel>
        <div>
          <Panel title="Verzorging">
            {plant.care_tips ? (
              <p className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed">{plant.care_tips}</p>
            ) : (
              <EmptyNote>Nog geen verzorgingstips voor deze plant.</EmptyNote>
            )}
          </Panel>
          <Panel title="Notitie">
            <PlantNoteForm plantId={plant.id} initial={plant.customer_note || ''} />
          </Panel>
        </div>
      </div>
      <Panel title="Meldingen">
        {reports.length === 0 ? (
          <EmptyNote>Nog geen meldingen voor deze plant.</EmptyNote>
        ) : (
          <ul className="divide-y divide-stera-line">
            {reports.map((report) => (
              <li key={report.id} className="px-5 py-4 text-sm">
                <p className="font-medium text-stera-green">
                  {ISSUE[report.issue_type] || report.issue_type} · {report.status}
                </p>
                {report.message ? <p className="mt-1 text-stera-ink">{report.message}</p> : null}
                <p className="mt-1 text-xs text-stera-ink-soft">
                  {formatDay(report.created_at)}
                  {report.reporter_name ? ` · ${report.reporter_name}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        {plant.qr_slug ? (
          <p className="border-t border-stera-line px-5 py-4 text-sm">
            <Link href={`/p/${plant.qr_slug}/report`} className="text-stera-green underline underline-offset-2">
              Probleem melden
            </Link>
          </p>
        ) : null}
      </Panel>
    </PortalShell>
  )
}
