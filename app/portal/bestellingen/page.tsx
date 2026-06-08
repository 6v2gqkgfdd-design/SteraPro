import Link from 'next/link'
import PortalShell, { PageHeading, Panel, DataTable } from '@/components/portal-shell'

export const metadata = { title: 'Bestellingen' }

export default function Page() {
  return (
    <PortalShell active="/portal/bestellingen" company="Bakkerij 't Stadshof">
      <PageHeading title="Bestellingen" sub="Je webshopbestellingen. Voor herbestellen of betalen ga je naar de webshop." />
      <Panel title="Bestellingen" source="via Shopify">
        <DataTable
          head={['Order', 'Datum', 'Items', 'Bedrag', 'Status']}
          rows={[
            ['#1187', '28 mei 2026', '4 producten', '€ 286', { tag: 'ok', text: 'Geleverd' }],
            ['#1203', '06 jun 2026', '1 product', '€ 79', { tag: 'info', text: 'Onderweg' }],
            ['#1156', '09 apr 2026', '2 producten', '€ 134', { tag: 'ok', text: 'Geleverd' }],
          ]}
        />
      </Panel>
      <Link href="https://sterapro.be" className="text-sm text-stera-green hover:underline">
        Opnieuw bestellen in de webshop →
      </Link>
    </PortalShell>
  )
}
