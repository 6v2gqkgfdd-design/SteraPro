import { notFound } from 'next/navigation'
import PortalShell, { PageHeading, Panel } from '@/components/portal-shell'
import { formatDayTime } from '@/lib/company-labels'
import { loadMaintenance, visitTag, workOrderTag } from '@/lib/portal-data'
import { mspHref } from '@/lib/msp-request'

export const dynamic = 'force-dynamic'

function who(name: string | null): string {
  if (!name || name === 'Stera-team') return 'Wij'
  return name
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadMaintenance()
  const visit = data.visits.find((row) => row.id === id)
  if (!visit) notFound()
  const tag = visitTag(visit.status)
  const orders = data.workOrders.filter((order) => order.visit_id === visit.id)

  return (
    <PortalShell active="/portal/onderhoud" company={data.companyName} demo={data.demo}>
      <p>
        <a className="msp-link" href={mspHref('/portal/onderhoud')}>
          Alle beurten
        </a>
      </p>
      <PageHeading title={visit.title || 'Onderhoudsbeurt'} sub={visit.location_name || undefined} />
      <div className="msp-split">
        <Panel title="Beurt">
          <div className="msp-kv">
            <span>Status</span>
            <b>
              <span className={`msp-badge msp-badge-${tag.tag}`}>{tag.text}</span>
            </b>
          </div>
          <div className="msp-kv">
            <span>Wanneer</span>
            <b>{formatDayTime(visit.scheduled_start || visit.ended_at)}</b>
          </div>
          <div className="msp-kv">
            <span>Door</span>
            <b>{who(visit.performed_by)}</b>
          </div>
        </Panel>
        <Panel title="Verslag">
          {visit.general_notes ? (
            <p style={{ whiteSpace: 'pre-wrap' }}>{visit.general_notes}</p>
          ) : (
            <p>
              {visit.status === 'completed'
                ? 'Deze beurt heeft nog geen verslag.'
                : 'Het verslag verschijnt hier nadat de beurt is afgewerkt.'}
            </p>
          )}
        </Panel>
      </div>
      <Panel title="Gekoppelde werkbonnen">
        {orders.length === 0 ? (
          <p>Geen werkbon gekoppeld aan deze beurt.</p>
        ) : (
          orders.map((order) => {
            const orderTag = workOrderTag(order.status)
            return (
              <div key={order.id} className="msp-kv">
                <span>{order.reference_number}</span>
                <b>
                  <span className={`msp-badge msp-badge-${orderTag.tag}`}>{orderTag.text}</span>
                </b>
              </div>
            )
          })
        )}
      </Panel>
    </PortalShell>
  )
}
