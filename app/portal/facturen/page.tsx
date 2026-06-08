import PortalShell, { PageHeading, Panel, DataTable } from '@/components/portal-shell'

export const metadata = { title: 'Facturen' }

export default function Page() {
  return (
    <PortalShell active="/portal/facturen" company="Bakkerij 't Stadshof">
      <PageHeading title="Facturen" sub="Je facturen, met downloadbare PDF." />
      <Panel title="Facturen" source="via Accountable">
        <DataTable
          head={['Factuur', 'Datum', 'Bedrag', 'Status', 'PDF']}
          rows={[
            ['2026-0451', '31 mei 2026', '€ 145', { tag: 'ok', text: 'Betaald' }, '⬇ PDF'],
            ['2026-0512', '06 jun 2026', '€ 286', { tag: 'warn', text: 'Open' }, '⬇ PDF'],
            ['2026-0399', '30 apr 2026', '€ 145', { tag: 'ok', text: 'Betaald' }, '⬇ PDF'],
          ]}
        />
      </Panel>
    </PortalShell>
  )
}
