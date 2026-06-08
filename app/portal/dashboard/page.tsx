import PortalShell, { PageHeading, Stat, Panel, DataTable } from '@/components/portal-shell'

export const metadata = { title: 'Dashboard' }
const COMPANY = "Bakkerij 't Stadshof"

export default function Page() {
  return (
    <PortalShell active="/portal/dashboard" company={COMPANY}>
      <PageHeading
        title="Welkom terug, 't Stadshof"
        sub="Alles over je planten, onderhoud en bestellingen op één plek."
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Volgend onderhoud" value="18 jun" hint="over 10 dagen · Jonas" />
        <Stat label="Planten in beheer" value="24" hint="3 locaties" />
        <Stat label="Open offertes" value="1" hint="wacht op jouw akkoord" />
        <Stat label="Contract" value="Actief" hint="tot 31 dec 2026" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recente onderhoudsbeurten">
          <DataTable
            head={['Datum', 'Door', 'Status']}
            rows={[
              ['21 mei 2026', 'Jonas', { tag: 'ok', text: 'Afgewerkt' }],
              ['16 apr 2026', 'Jonas', { tag: 'ok', text: 'Afgewerkt' }],
              ['12 mrt 2026', 'Lien', { tag: 'ok', text: 'Afgewerkt' }],
            ]}
          />
        </Panel>
        <Panel title="Aandacht nodig">
          <DataTable
            head={['Plant', 'Locatie', 'Status']}
            rows={[
              ['Calathea', 'Inkom', { tag: 'warn', text: 'Water nodig' }],
              ['Ficus', 'Vergaderzaal', { tag: 'info', text: 'Opvolgen' }],
              ['Kentia', 'Balie', { tag: 'ok', text: 'Gezond' }],
            ]}
          />
        </Panel>
      </div>
    </PortalShell>
  )
}
