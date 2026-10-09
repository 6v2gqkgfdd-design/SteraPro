import PortalShell, { PageHeading, Panel, DataTable, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatDay, formatEurFromCents } from '@/lib/company-labels'
import { loadPortalQuotes, quoteTag } from '@/lib/portal-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Offertes' }

export default async function Page() {
  const { companyName, schemaReady, rows, demo } = await loadPortalQuotes()
  const open = rows.filter((quote) => quote.status === 'sent' && quote.signing_token)

  return (
    <PortalShell active="/portal/offertes" company={companyName} demo={demo}>
      <PageHeading title="Offertes" sub="Voorstellen van Stera Pro, met het bedrag dat voor jou geldt." />
      {schemaReady ? null : <SchemaNotice />}
      <Panel title="Offertes">
        {rows.length === 0 ? (
          <EmptyNote>Er staan geen offertes klaar.</EmptyNote>
        ) : (
          <DataTable
            head={['Nr', 'Datum', 'Omschrijving', 'Bedrag', 'Status']}
            rows={rows.map((quote) => [
              quote.reference_number || '—',
              formatDay(quote.created_at),
              quote.title || quote.location_name || 'Offerte',
              formatEurFromCents(quote.subtotal_cents),
              quoteTag(quote.status),
            ])}
          />
        )}
      </Panel>
      {open.length > 0 ? (
        <div className="flex flex-col gap-2">
          {open.map((quote) => (
            <a key={quote.id} className="msp-link" href={`/q/${quote.signing_token}`}>
              {quote.reference_number || 'Offerte'} beoordelen
            </a>
          ))}
        </div>
      ) : null}
    </PortalShell>
  )
}
