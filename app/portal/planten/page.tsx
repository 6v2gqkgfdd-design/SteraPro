import PortalShell, { SchemaNotice } from '@/components/portal-shell'
import { mspHref } from '@/lib/msp-request'
import { loadPortalPlants, plantLabel, plantPlace, plantTag } from '@/lib/portal-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mijn planten' }

export default async function Page() {
  const { companyName, schemaReady, rows, demo } = await loadPortalPlants()
  const locations = new Set(rows.map((plant) => plant.location_name).filter(Boolean))

  return (
    <PortalShell active="/portal/planten" company={companyName} demo={demo}>
      <p className="msp-kicker">{companyName}</p>
      <h1 className="msp-title">Mijn planten</h1>
      <p className="msp-lead">
        {schemaReady
          ? `${rows.length} planten op ${locations.size} locatie${locations.size === 1 ? '' : 's'}.`
          : 'Je planten verschijnen hier na de koppeling.'}
      </p>
      {schemaReady ? null : <SchemaNotice />}
      {rows.length === 0 ? (
        <p className="msp-pad">Er staan nog geen planten op je bedrijf.</p>
      ) : (
        <div className="msp-plants" style={{ marginTop: 20 }}>
          {rows.map((plant) => {
            const tag = plantTag(plant)
            return (
              <a key={plant.id} className="msp-plant" href={mspHref(`/portal/planten/${plant.id}`)}>
                {plant.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={plant.photo_url} alt="" />
                ) : (
                  <span className="msp-ph" aria-hidden="true">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M12 22V10" />
                      <path d="M12 10C12 6 9 4 6 4c0 4 3 6 6 6z" />
                      <path d="M12 14c0-3 3-5 6-5 0 4-3 6-6 6z" />
                    </svg>
                  </span>
                )}
                <div>
                  <small>{plantPlace(plant)}</small>
                  <b>{plantLabel(plant)}</b>
                  {plant.species && plant.species !== plantLabel(plant) ? <i>{plant.species}</i> : null}
                  <span className={`msp-badge msp-badge-${tag.tag}`} style={{ marginTop: 8 }}>{tag.text}</span>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </PortalShell>
  )
}
