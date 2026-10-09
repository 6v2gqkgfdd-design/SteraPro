import { notFound } from 'next/navigation'
import PortalShell, { Panel, EmptyNote } from '@/components/portal-shell'
import { formatDay } from '@/lib/company-labels'
import { loadPortalPlants, plantLabel, plantPlace, plantTag, reportStatusLabel } from '@/lib/portal-data'
import { demoPortalSnapshot } from '@/lib/portal-demo'
import { issueLabel } from '@/lib/report-issues'
import { mspApi, mspHref, mspStore } from '@/lib/msp-request'

export const dynamic = 'force-dynamic'

function Leaf() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 22V10" />
      <path d="M12 10C12 6 9 4 6 4c0 4 3 6 6 6z" />
      <path d="M12 14c0-3 3-5 6-5 0 4-3 6-6 6z" />
    </svg>
  )
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ notitie?: string; fout?: string }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : {}
  const data = await loadPortalPlants()
  const plant = data.rows.find((row) => row.id === id)
  if (!plant) notFound()

  const snap = data.demo ? await demoPortalSnapshot() : null
  const reports = snap?.reports.filter((report) => report.plant_id === plant.id) || []
  const tag = plantTag(plant)
  const reportHref = plant.qr_slug
    ? `${mspHref(`/p/${plant.qr_slug}/report`)}${data.demo ? '?voorbeeld=1' : ''}`
    : null

  return (
    <PortalShell active="/portal/planten" company={data.companyName} demo={data.demo}>
      <p>
        <a className="msp-link" href={mspHref('/portal/planten')}>
          Alle planten
        </a>
      </p>
      <p className="msp-kicker">{plantPlace(plant)}</p>
      <div className="msp-head">
        <div>
          <h1 className="msp-title">{plantLabel(plant)}</h1>
          {plant.species ? <p className="msp-latin">{plant.species}</p> : null}
        </div>
        {reportHref ? (
          <a className="msp-btn" href={reportHref}>
            Probleem melden
          </a>
        ) : null}
      </div>
      <p style={{ marginBottom: 16 }}>
        <span className={`msp-badge msp-badge-${tag.tag}`}>{tag.text}</span>
      </p>
      <div className="msp-split">
        <section className="msp-panel">
          <h2>Plant</h2>
          {plant.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plant.photo_url} alt="" className="msp-ph msp-ph-sm" />
          ) : (
            <span className="msp-ph msp-ph-sm">
              <Leaf />
            </span>
          )}
          <p>Geplaatst: {plant.installed_at ? formatDay(plant.installed_at) : '—'}</p>
          {plant.qr_slug ? (
            <p>
              <a className="msp-link" href={mspHref(`/p/${plant.qr_slug}`)}>
                Scanpagina
              </a>
              {' · '}
              <a className="msp-link" href={mspHref(`/p/${plant.qr_slug}/label`)}>
                Label
              </a>
            </p>
          ) : null}
        </section>
        <div>
          <section className="msp-panel">
            <h2>Verzorging</h2>
            {plant.care_tips ? (
              <p style={{ whiteSpace: 'pre-wrap' }}>{plant.care_tips}</p>
            ) : (
              <EmptyNote>Nog geen verzorgingstips voor deze plant.</EmptyNote>
            )}
          </section>
          <section className="msp-panel">
            <h2>Notitie</h2>
            {query.notitie === '1' ? <p className="msp-banner">Notitie bewaard.</p> : null}
            {query.notitie === 'voorbeeld' ? (
              <p className="msp-banner">
                Voorbeeld. Via de shop bewaren we de notitie niet in de database.
              </p>
            ) : null}
            {query.fout ? <p className="msp-note">{query.fout}</p> : null}
            <form action={mspApi('notitie')} method="post" style={{ padding: '0 20px 20px' }}>
              <input type="hidden" name="plant" value={plant.id} />
              <input type="hidden" name="back" value={mspHref(`/portal/planten/${plant.id}`)} />
              {mspStore().demo || data.demo ? <input type="hidden" name="demo" value="1" /> : null}
              <label className="msp-label" htmlFor="plant-note">
                Jouw notitie
              </label>
              <textarea id="plant-note" name="note" maxLength={2000} defaultValue={plant.customer_note || ''} />
              <p style={{ marginTop: 12 }}>
                <button className="msp-btn" type="submit">
                  Notitie bewaren
                </button>
              </p>
            </form>
          </section>
        </div>
      </div>
      <Panel title="Meldingen">
        {reports.length === 0 ? (
          <EmptyNote>Nog geen meldingen voor deze plant.</EmptyNote>
        ) : (
          <ul>
            {reports.map((report) => (
              <li key={report.id} className="msp-kv">
                <span>
                  {issueLabel(report.issue_type)} · {reportStatusLabel(report.status)}
                  {report.message ? ` — ${report.message}` : ''}
                </span>
                <b>{formatDay(report.created_at)}</b>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PortalShell>
  )
}
