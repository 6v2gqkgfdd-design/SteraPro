import PortalShell, { PageHeading, Stat, Panel, DataTable } from '@/components/portal-shell'

export const metadata = { title: 'Onderhoud' }

export default function Page() {
  return (
    <PortalShell active="/portal/onderhoud" company="Bakkerij 't Stadshof">
      <PageHeading title="Onderhoud" sub="Geschiedenis en geplande beurten van je onderhoudscontract." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Volgende beurt" value="18 jun" hint="Jonas · 09:30" />
        <Stat label="Frequentie" value="4-wek." />
        <Stat label="Beurten dit jaar" value="5" />
        <Stat label="Laatste werkbon" value="#1042" />
      </div>
      <Panel title="Geplande & uitgevoerde beurten">
        <DataTable
          head={['Datum', 'Medewerker', 'Werkbon', 'Status']}
          rows={[
            ['18 jun 2026', 'Jonas', '—', { tag: 'info', text: 'Ingepland' }],
            ['21 mei 2026', 'Jonas', '#1042', { tag: 'ok', text: 'Afgewerkt' }],
            ['16 apr 2026', 'Jonas', '#1021', { tag: 'ok', text: 'Afgewerkt' }],
            ['12 mrt 2026', 'Lien', '#0998', { tag: 'ok', text: 'Afgewerkt' }],
          ]}
        />
      </Panel>
    </PortalShell>
  )
}
