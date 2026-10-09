import PortalShell, { Stat, Panel, DataTable, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatTime } from '@/lib/dates'
import { formatDayShort } from '@/lib/dates'
import { mspHref } from '@/lib/msp-request'
import {
  attentionPlants,
  loadDashboard,
  plantLabel,
  plantPlace,
  plantTag,
  recentVisits,
  reportStatusLabel,
  upcomingVisits,
  visitTag,
} from '@/lib/portal-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard' }

export default async function Page() {
  const data = await loadDashboard()
  const next = upcomingVisits(data.visits)[0]
  const recent = recentVisits(data.visits).slice(0, 5)
  const attention = attentionPlants(data.plants).slice(0, 8)
  const plantCount = data.company?.plant_count ?? data.plants.length
  const openReports = (data.reports || []).filter((report) => report.status !== 'handled').length
  const reportHref = attention[0]?.qr_slug
    ? `${mspHref(`/p/${attention[0].qr_slug}/report`)}${data.demo ? '?voorbeeld=1' : ''}`
    : mspHref('/portal/planten')

  return (
    <PortalShell active="/portal/dashboard" company={data.companyName} demo={data.demo}>
      <div className="msp-head">
        <div>
          <p className="msp-kicker">{data.companyName}</p>
          <h1 className="msp-title">Welkom terug</h1>
          <p className="msp-lead">
            {attention.length
              ? 'Je planten staan er goed bij. Eén plant vraagt aandacht.'
              : 'Je planten, het onderhoud en je meldingen op één plek.'}
          </p>
        </div>
        <a className="msp-btn" href={reportHref}>Probleem melden</a>
      </div>
      {data.schemaReady ? null : <SchemaNotice />}
      <div className="msp-kpis">
        <Stat
          label="Volgend onderhoud"
          value={next?.scheduled_start ? formatDayShort(next.scheduled_start) : '—'}
          hint={next?.scheduled_start ? `${formatTime(next.scheduled_start)} · wij komen langs` : 'nog niet ingepland'}
        />
        <Stat label="Planten in beheer" value={data.schemaReady ? String(plantCount) : '—'} />
        <Stat
          label="Open meldingen"
          value={data.schemaReady ? String(openReports) : '—'}
          hint={openReports ? reportStatusLabel('seen') : 'geen open meldingen'}
        />
      </div>
      <div className="msp-grid msp-grid-2">
        <Panel title="Recente onderhoudsbeurten">
          {recent.length === 0 ? (
            <EmptyNote>Nog geen afgewerkte beurten.</EmptyNote>
          ) : (
            <DataTable
              head={['Datum', 'Door', 'Status']}
              links={recent.map((visit) => `/portal/onderhoud/${visit.id}`)}
              rows={recent.map((visit) => [
                formatDayShort(visit.ended_at || visit.scheduled_start),
                'Wij',
                visitTag(visit.status),
              ])}
            />
          )}
        </Panel>
        <Panel title="Aandacht nodig">
          {attention.length === 0 ? (
            <EmptyNote>Geen planten die nu aandacht vragen.</EmptyNote>
          ) : (
            <DataTable
              head={['Plant', 'Locatie', 'Status']}
              links={attention.map((plant) => `/portal/planten/${plant.id}`)}
              rows={attention.map((plant) => [plantLabel(plant), plantPlace(plant), plantTag(plant)])}
            />
          )}
        </Panel>
      </div>
      <section className="msp-shop">
        <h2>Extra planten nodig?</h2>
        <p className="msp-lead">Bekijk het aanbod in de shop.</p>
        <p style={{ marginTop: 16 }}>
          <a className="msp-btn msp-btn-ghost" href="https://sterapro.be/collections/all">Naar alle planten</a>
        </p>
      </section>
    </PortalShell>
  )
}
