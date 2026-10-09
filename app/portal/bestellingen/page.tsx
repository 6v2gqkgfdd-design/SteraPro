import PortalShell, { PageHeading, Panel, DataTable, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatDay, formatEurFromCents } from '@/lib/company-labels'
import { loadPortalOrders, orderItemSummary, orderTag } from '@/lib/portal-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Bestellingen' }

export default async function Page() {
  const { companyName, schemaReady, rows, demo } = await loadPortalOrders()

  return (
    <PortalShell active="/portal/bestellingen" company={companyName} demo={demo}>
      <PageHeading
        title="Bestellingen"
        sub="Je webshopbestellingen. Opnieuw bestellen doe je in de catalogus."
      />
      {schemaReady ? null : <SchemaNotice />}
      <Panel title="Bestellingen" source="Shopify">
        {rows.length === 0 ? (
          <EmptyNote>Nog geen bestellingen gekoppeld aan je bedrijf.</EmptyNote>
        ) : (
          <DataTable
            head={['Order', 'Datum', 'Items', 'Bedrag', 'Status']}
            rows={rows.map((order) => [
              order.name || (order.shopify_order_number ? `#${order.shopify_order_number}` : '—'),
              formatDay(order.ordered_at),
              orderItemSummary(order),
              formatEurFromCents(order.total_price_cents, order.currency || 'EUR'),
              orderTag(order),
            ])}
          />
        )}
      </Panel>
      <p>
        <a className="msp-link" href="https://sterapro.be/collections/all">
          Opnieuw bestellen in de shop
        </a>
      </p>
    </PortalShell>
  )
}
