import PortalShell, { PageHeading, Panel, DataTable } from '@/components/portal-shell'

export const metadata = { title: 'Leveringen' }

export default function Page() {
  return (
    <PortalShell active="/portal/leveringen" company="Bakkerij 't Stadshof">
      <PageHeading title="Leveringen" sub="Geplande en uitgevoerde plant-leveringen en installaties door Stera Pro." />
      <Panel title="Leveringen" source="Stera Pro · planning">
        <DataTable
          head={['Datum', 'Inhoud', 'Type', 'Status']}
          rows={[
            ['25 jun 2026', '2 × Strelitzia + potten', 'Levering + plaatsing', { tag: 'info', text: 'Ingepland' }],
            ['03 feb 2026', 'Mosmuur paneel 2m²', 'Installatie', { tag: 'ok', text: 'Geleverd' }],
            ['12 jan 2026', 'Startpakket 22 planten', 'Levering + plaatsing', { tag: 'ok', text: 'Geleverd' }],
          ]}
        />
      </Panel>
    </PortalShell>
  )
}
