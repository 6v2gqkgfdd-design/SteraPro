import PortalShell, { PageHeading, Panel, DataTable, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatDay } from '@/lib/company-labels'
import { loadPortalWorkOrders, workOrderTag } from '@/lib/portal-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Facturen' }

export default async function Page() {
  const { companyName, schemaReady, rows } = await loadPortalWorkOrders()
  const invoices = rows.filter((order) => order.status === 'invoiced' || order.invoice_reference)

  return (
    <PortalShell active="/portal/facturen" company={companyName}>
      <PageHeading
        title="Facturen"
        sub="Werkbonnen die in het beheer als gefactureerd gemarkeerd zijn."
      />
      {schemaReady ? null : <SchemaNotice />}
      <Panel title="Facturen">
        {invoices.length === 0 ? (
          <EmptyNote>Er staan nog geen gefactureerde werkbonnen op je bedrijf.</EmptyNote>
        ) : (
          <DataTable
            head={['Factuur', 'Datum', 'Werkbon', 'Status']}
            rows={invoices.map((order) => [
              order.invoice_reference || '—',
              formatDay(order.invoiced_at || order.created_at),
              order.reference_number || '—',
              workOrderTag(order.status),
            ])}
          />
        )}
      </Panel>
      <p className="text-sm text-stera-ink-soft">
        Een PDF uit de boekhouding volgt wanneer die koppeling er is. Het bedrag staat op de
        factuur zelf.
      </p>
    </PortalShell>
  )
}
