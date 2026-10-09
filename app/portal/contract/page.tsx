import PortalShell, { PageHeading, Panel, SchemaNotice } from '@/components/portal-shell'
import { formatDayTime } from '@/lib/company-labels'
import { loadContract, upcomingVisits } from '@/lib/portal-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Contract' }

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="msp-kv">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  )
}

export default async function Page() {
  const data = await loadContract()
  const next = upcomingVisits(data.visits)[0]
  const active = Boolean(data.company?.has_maintenance_contract)

  return (
    <PortalShell active="/portal/contract" company={data.companyName} demo={data.demo}>
      <PageHeading
        title="Onderhoudscontract"
        sub="Of er een onderhoudscontract loopt, en wanneer de volgende beurt gepland staat."
      />
      {data.schemaReady ? null : <SchemaNotice />}
      <div className="msp-split">
        <Panel title="Contract">
          <Row k="Status" v={data.schemaReady ? (active ? 'Actief' : 'Geen contract') : '—'} />
          <Row k="Locaties" v={data.company ? String(data.company.location_count) : '—'} />
          <Row k="Planten in beheer" v={data.company ? String(data.company.plant_count) : '—'} />
          <Row
            k="Volgende beurt"
            v={next?.scheduled_start ? formatDayTime(next.scheduled_start) : 'Nog niet ingepland'}
          />
          {next?.title ? <Row k="Omschrijving" v={next.title} /> : null}
          {next?.performed_by ? <Row k="Door" v={next.performed_by === 'Stera-team' ? 'Wij' : next.performed_by} /> : null}
        </Panel>
        {data.demo && data.sample ? (
          <Panel title="Voorbeeldcijfers">
            <Row k="Looptijd" v={data.sample.term} />
            <Row k="Frequentie" v={data.sample.frequency} />
            <Row k="Tarief" v={data.sample.price} />
            <p>{data.sample.note}</p>
          </Panel>
        ) : (
          <Panel title="Wat hier nog niet staat">
            <p>
              Looptijd, bezoekfrequentie en tarief zitten nog niet in een contracttabel.
              Die cijfers komen erbij zodra ze in het beheer vastliggen. Tot dan tonen we
              alleen het contractvlaggetje en de geplande onderhoudsbeurten.
            </p>
          </Panel>
        )}
      </div>
    </PortalShell>
  )
}
