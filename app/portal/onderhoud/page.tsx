import PortalShell, { PageHeading, Stat, Panel, DataTable, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatDayTime } from '@/lib/company-labels'
import { formatDayShort } from '@/lib/dates'
import { loadMaintenance, upcomingVisits, visitTag, workOrderTag } from '@/lib/portal-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Onderhoud' }

export default async function Page() {
  const data = await loadMaintenance()
  const upcoming = upcomingVisits(data.visits)
  const next = upcoming[0]
  const year = new Date().getFullYear()
  const doneThisYear = data.visits.filter((visit) => {
    if (visit.status !== 'completed') return false
    const raw = visit.ended_at || visit.scheduled_start
    if (!raw) return false
    return new Date(raw).getFullYear() === year
  }).length
  const latestOrder = data.workOrders[0]
  const rows = [...data.visits].sort(
    (a, b) =>
      new Date(b.scheduled_start || b.ended_at || 0).getTime() -
      new Date(a.scheduled_start || a.ended_at || 0).getTime()
  )

  return (
    <PortalShell active="/portal/onderhoud" company={data.companyName}>
      <PageHeading
        title="Onderhoud"
        sub="Geplande en uitgevoerde beurten, met de bijhorende werkbonnen."
      />
      {data.schemaReady ? null : <SchemaNotice />}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Volgende beurt"
          value={next?.scheduled_start ? formatDayShort(next.scheduled_start) : '—'}
          hint={next?.performed_by || undefined}
        />
        <Stat label="Gepland" value={data.schemaReady ? String(upcoming.length) : '—'} />
        <Stat label="Beurten dit jaar" value={data.schemaReady ? String(doneThisYear) : '—'} />
        <Stat label="Laatste werkbon" value={latestOrder?.reference_number || '—'} />
      </div>
      <Panel title="Geplande en uitgevoerde beurten">
        {rows.length === 0 ? (
          <EmptyNote>Nog geen onderhoudsbeurten.</EmptyNote>
        ) : (
          <DataTable
            head={['Datum', 'Medewerker', 'Locatie', 'Status']}
            links={rows.map((visit) => `/portal/onderhoud/${visit.id}`)}
            rows={rows.map((visit) => [
              formatDayTime(visit.scheduled_start || visit.ended_at),
              visit.performed_by || '—',
              visit.location_name || visit.title || '—',
              visitTag(visit.status),
            ])}
          />
        )}
      </Panel>
      <Panel title="Werkbonnen">
        {data.workOrders.length === 0 ? (
          <EmptyNote>Nog geen werkbonnen die met je gedeeld zijn.</EmptyNote>
        ) : (
          <DataTable
            head={['Nummer', 'Beurt', 'Datum', 'Status']}
            rows={data.workOrders.map((order) => [
              order.reference_number || '—',
              order.visit_title || order.location_name || '—',
              formatDayTime(order.scheduled_start || order.created_at),
              workOrderTag(order.status),
            ])}
          />
        )}
      </Panel>
    </PortalShell>
  )
}
