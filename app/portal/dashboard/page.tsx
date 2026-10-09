import Link from 'next/link'
import PortalShell, { PageHeading, Stat, Panel, DataTable, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatDayTime } from '@/lib/company-labels'
import { formatDayShort } from '@/lib/dates'
import {
  attentionPlants,
  loadDashboard,
  plantLabel,
  plantPlace,
  plantTag,
  recentVisits,
  upcomingVisits,
  visitTag,
} from '@/lib/portal-data'
import { demoFlow } from '@/lib/portal-demo-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard' }

export default async function Page() {
  const data = await loadDashboard()
  const next = upcomingVisits(data.visits)[0]
  const recent = recentVisits(data.visits).slice(0, 5)
  const attention = attentionPlants(data.plants).slice(0, 8)
  const openQuotes = data.quotes.filter((quote) => quote.status === 'sent').length
  const plantCount = data.company?.plant_count ?? data.plants.length
  const locationCount = data.company?.location_count ?? 0

  return (
    <PortalShell active="/portal/dashboard" company={data.companyName}>
      <PageHeading
        title={`Welkom terug, ${data.companyName}`}
        sub="Alles over je planten, onderhoud en bestellingen op één plek."
      />
      {data.schemaReady ? null : <SchemaNotice />}
      {data.demo ? (
        <Panel title="Zo hangt het voorbeeld samen">
          <ol className="list-decimal space-y-1 px-8 py-4 text-sm text-stera-ink">
            {demoFlow().map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Panel>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Volgend onderhoud"
          value={next?.scheduled_start ? formatDayShort(next.scheduled_start) : '—'}
          hint={next ? [formatDayTime(next.scheduled_start), next.performed_by].filter(Boolean).join(' · ') : 'nog niet ingepland'}
        />
        <Stat
          label="Planten in beheer"
          value={data.schemaReady ? String(plantCount) : '—'}
          hint={locationCount ? `${locationCount} locatie${locationCount === 1 ? '' : 's'}` : undefined}
        />
        <Stat
          label="Open offertes"
          value={data.schemaReady ? String(openQuotes) : '—'}
          hint={openQuotes === 1 ? 'wacht op jouw akkoord' : openQuotes > 1 ? 'wachten op jouw akkoord' : undefined}
        />
        <Stat
          label="Contract"
          value={data.company?.has_maintenance_contract ? 'Actief' : data.schemaReady ? 'Geen' : '—'}
          hint={next?.scheduled_start ? `volgende beurt ${formatDayShort(next.scheduled_start)}` : undefined}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recente onderhoudsbeurten">
          {recent.length === 0 ? (
            <EmptyNote>Nog geen afgewerkte beurten.</EmptyNote>
          ) : (
            <DataTable
              head={['Datum', 'Door', 'Status']}
              links={recent.map((visit) => `/portal/onderhoud/${visit.id}`)}
              rows={recent.map((visit) => [
                formatDayTime(visit.ended_at || visit.scheduled_start),
                visit.performed_by || '—',
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
      <p className="text-sm">
        <Link href="/portal/aanvraag" className="text-stera-green hover:underline">
          Nieuwe planten aanvragen →
        </Link>
      </p>
      {openQuotes > 0 ? (
        <p className="mt-2 text-sm">
          <Link href="/portal/offertes" className="text-stera-green hover:underline">
            {openQuotes === 1 ? '1 offerte te beoordelen' : `${openQuotes} offertes te beoordelen`} →
          </Link>
        </p>
      ) : null}
    </PortalShell>
  )
}
