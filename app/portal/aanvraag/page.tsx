import PortalShell, { PageHeading, Panel, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatDay } from '@/lib/company-labels'
import { loadPortalRequests, requestStatusLabel } from '@/lib/portal-data'
import RequestForm from './request-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nieuwe planten aanvragen' }

export default async function Page() {
  const { companyName, schemaReady, rows } = await loadPortalRequests()

  return (
    <PortalShell active="/portal/aanvraag" company={companyName}>
      <PageHeading
        title="Nieuwe planten aanvragen"
        sub="Vraag extra planten of een uitbreiding aan. Stera Pro ziet de vraag in het beheer."
      />
      {schemaReady ? null : <SchemaNotice />}
      <RequestForm />
      <div className="mt-8">
        <Panel title="Jouw aanvragen">
          {rows.length === 0 ? (
            <EmptyNote>Nog geen aanvragen.</EmptyNote>
          ) : (
            <ul className="divide-y divide-stera-line">
              {rows.map((row) => (
                <li key={row.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-stera-green">
                      {[row.quantity, row.species].filter(Boolean).join(' × ') || 'Planten'}
                    </p>
                    <p className="text-xs text-stera-ink-soft">
                      {requestStatusLabel(row.status)} · {formatDay(row.created_at)}
                    </p>
                  </div>
                  {row.location_note ? (
                    <p className="mt-1 text-sm text-stera-ink-soft">{row.location_note}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-stera-ink">{row.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PortalShell>
  )
}
