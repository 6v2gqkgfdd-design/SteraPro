import PortalShell, { PageHeading, Panel, DataTable, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatDayTime } from '@/lib/company-labels'
import { deliveryTag, loadPortalOrders, orderItemSummary } from '@/lib/portal-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leveringen' }

export default async function Page() {
  const { companyName, schemaReady, rows } = await loadPortalOrders()

  return (
    <PortalShell active="/portal/leveringen" company={companyName}>
      <PageHeading
        title="Leveringen"
        sub="Geplande en uitgevoerde leveringen van je webshopbestellingen."
      />
      {schemaReady ? null : <SchemaNotice />}
      <Panel title="Leveringen" source="Shopify">
        {rows.length === 0 ? (
          <EmptyNote>
            Nog geen bestellingen gekoppeld aan je bedrijf. Ze verschijnen hier zodra het
            Shopify-klantnummer op je bedrijf staat en de orders gesynchroniseerd zijn.
          </EmptyNote>
        ) : (
          <DataTable
            head={['Datum', 'Inhoud', 'Order', 'Status']}
            rows={rows.map((order) => [
              formatDayTime(order.scheduled_start || order.ordered_at),
              orderItemSummary(order),
              order.name || (order.shopify_order_number ? `#${order.shopify_order_number}` : '—'),
              deliveryTag(order.delivery_status),
            ])}
          />
        )}
      </Panel>
    </PortalShell>
  )
}
