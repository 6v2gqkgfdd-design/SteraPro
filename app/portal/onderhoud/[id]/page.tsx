import Link from 'next/link'
import { notFound } from 'next/navigation'
import PortalShell, { PageHeading, Panel } from '@/components/portal-shell'
import { formatDayTime } from '@/lib/company-labels'
import { loadMaintenance, visitTag } from '@/lib/portal-data'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadMaintenance()
  const visit = data.visits.find((row) => row.id === id)
  if (!visit) notFound()
  const tag = visitTag(visit.status)
  const orders = data.workOrders.filter((order) => order.visit_id === visit.id)

  return (
    <PortalShell active="/portal/onderhoud" company={data.companyName}>
      <PageHeading title={visit.title || 'Onderhoudsbeurt'} sub={visit.location_name || undefined} />
      <div className="mb-4">
        <Link href="/portal/onderhoud" className="text-sm text-stera-green underline-offset-2 hover:underline">
          ← Alle beurten
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Beurt">
          <dl className="space-y-2 px-5 py-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-stera-ink-soft">Status</dt>
              <dd className="font-medium text-stera-green">{tag.text}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-stera-ink-soft">Wanneer</dt>
              <dd>{formatDayTime(visit.scheduled_start || visit.ended_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-stera-ink-soft">Door</dt>
              <dd>{visit.performed_by || '—'}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Verslag">
          {visit.general_notes ? (
            <p className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed">{visit.general_notes}</p>
          ) : (
            <p className="px-5 py-4 text-sm text-stera-ink-soft">
              {visit.status === 'completed'
                ? 'Deze beurt heeft nog geen verslag.'
                : 'Het verslag verschijnt hier nadat de beurt is afgewerkt.'}
            </p>
          )}
        </Panel>
      </div>
      <Panel title="Gekoppelde werkbonnen">
        {orders.length === 0 ? (
          <p className="px-5 py-4 text-sm text-stera-ink-soft">Geen werkbon gekoppeld aan deze beurt.</p>
        ) : (
          <ul className="divide-y divide-stera-line">
            {orders.map((order) => (
              <li key={order.id} className="px-5 py-4 text-sm">
                <span className="font-medium text-stera-green">{order.reference_number}</span>
                <span className="text-stera-ink-soft"> · {order.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PortalShell>
  )
}
