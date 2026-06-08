import PortalShell, { PageHeading, Panel, DataTable } from '@/components/portal-shell'

export const metadata = { title: 'Offertes' }

export default function Page() {
  return (
    <PortalShell active="/portal/offertes" company="Bakkerij 't Stadshof">
      <PageHeading title="Offertes" sub="Voorstellen van Stera Pro die wachten op jouw akkoord." />
      <Panel title="Offertes">
        <DataTable
          head={['Nr', 'Datum', 'Omschrijving', 'Bedrag', 'Status']}
          rows={[
            ['OFF-0098', '02 jun 2026', 'Uitbreiding vergaderzaal (3 planten)', '€ 410', { tag: 'warn', text: 'Te beoordelen' }],
            ['OFF-0071', '14 mrt 2026', 'Mosmuur inkom', '€ 1.250', { tag: 'ok', text: 'Goedgekeurd' }],
          ]}
        />
      </Panel>
      <div className="flex flex-wrap gap-3">
        <button className="stera-cta stera-cta-primary">Offerte OFF-0098 goedkeuren</button>
        <button className="stera-cta stera-cta-secondary">Aanpassing vragen</button>
      </div>
    </PortalShell>
  )
}
