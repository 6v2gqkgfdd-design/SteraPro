import PortalShell, { PageHeading, Panel, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatDay } from '@/lib/company-labels'
import { loadPortalRequests, requestStatusLabel } from '@/lib/portal-data'
import { mspApi, mspHref, mspStore } from '@/lib/msp-request'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nieuwe planten aanvragen' }

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ aanvraag?: string; fout?: string }>
}) {
  const query = searchParams ? await searchParams : {}
  const { companyName, schemaReady, rows, demo } = await loadPortalRequests()

  return (
    <PortalShell active="/portal/aanvraag" company={companyName} demo={demo}>
      <PageHeading
        title="Nieuwe planten aanvragen"
        sub="Vraag extra planten of een uitbreiding aan. We zien de vraag in het beheer."
      />
      {schemaReady ? null : <SchemaNotice />}
      {query.aanvraag === '1' ? <p className="msp-banner">Aanvraag ontvangen.</p> : null}
      {query.aanvraag === 'voorbeeld' ? (
        <p className="msp-banner">Voorbeeld. Via de shop bewaren we de aanvraag niet in de database.</p>
      ) : null}
      {query.fout ? <p className="msp-note">{query.fout}</p> : null}
      <form action={mspApi('aanvraag')} method="post" className="msp-panel" style={{ padding: 20 }}>
        <input type="hidden" name="back" value={mspHref('/portal/aanvraag')} />
        {mspStore().demo || demo ? <input type="hidden" name="demo" value="1" /> : null}
        <label className="msp-label" htmlFor="species">
          Plant
        </label>
        <input id="species" className="msp-input" name="species" type="text" />
        <label className="msp-label" htmlFor="quantity">
          Aantal
        </label>
        <input id="quantity" className="msp-input" name="quantity" type="text" />
        <label className="msp-label" htmlFor="location">
          Plaats
        </label>
        <input id="location" className="msp-input" name="location" type="text" />
        <label className="msp-label" htmlFor="message">
          Toelichting
        </label>
        <textarea id="message" name="message" required minLength={3} />
        <p style={{ marginTop: 16 }}>
          <button className="msp-btn" type="submit">
            Aanvraag versturen
          </button>
        </p>
      </form>
      <Panel title="Jouw aanvragen">
        {rows.length === 0 ? (
          <EmptyNote>Nog geen aanvragen.</EmptyNote>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="msp-kv">
              <span>
                {[row.quantity, row.species].filter(Boolean).join(' × ') || 'Planten'}
                {row.message ? ` — ${row.message}` : ''}
              </span>
              <b>
                {requestStatusLabel(row.status)} · {formatDay(row.created_at)}
              </b>
            </div>
          ))
        )}
      </Panel>
    </PortalShell>
  )
}
