import PortalShell, { PageHeading, Panel, DataTable } from '@/components/portal-shell'

export const metadata = { title: 'Mijn planten' }

export default function Page() {
  return (
    <PortalShell active="/portal/planten" company="Bakkerij 't Stadshof">
      <PageHeading title="Mijn planten" sub="Alle door Stera Pro geleverde planten in je bedrijf, met status." />
      <Panel title="24 planten · 3 locaties">
        <DataTable
          head={['Plant', 'Locatie', 'Geleverd', 'Status']}
          rows={[
            ['Kentia palm', 'Balie', '12 jan 2026', { tag: 'ok', text: 'Gezond' }],
            ['Calathea', 'Inkom', '12 jan 2026', { tag: 'warn', text: 'Water nodig' }],
            ['Ficus lyrata', 'Vergaderzaal', '12 jan 2026', { tag: 'info', text: 'Opvolgen' }],
            ['Zamioculcas', 'Bureau', '12 jan 2026', { tag: 'ok', text: 'Gezond' }],
            ['Mosmuur', 'Inkom', '03 feb 2026', { tag: 'ok', text: 'Gezond' }],
          ]}
        />
      </Panel>
    </PortalShell>
  )
}
