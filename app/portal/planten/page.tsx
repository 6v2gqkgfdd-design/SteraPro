import PortalShell, { PageHeading, Panel, DataTable, SchemaNotice, EmptyNote } from '@/components/portal-shell'
import { formatDay } from '@/lib/company-labels'
import { loadPortalPlants, plantLabel, plantPlace, plantTag } from '@/lib/portal-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mijn planten' }

export default async function Page() {
  const { companyName, schemaReady, rows } = await loadPortalPlants()
  const locations = new Set(rows.map((plant) => plant.location_name).filter(Boolean))

  return (
    <PortalShell active="/portal/planten" company={companyName}>
      <PageHeading
        title="Mijn planten"
        sub="Alle planten die Stera Pro bij je bedrijf opvolgt, met de laatste status."
      />
      {schemaReady ? null : <SchemaNotice />}
      <Panel
        title={
          schemaReady
            ? `${rows.length} plant${rows.length === 1 ? '' : 'en'} · ${locations.size} locatie${locations.size === 1 ? '' : 's'}`
            : 'Planten'
        }
      >
        {rows.length === 0 ? (
          <EmptyNote>Er staan nog geen planten op je bedrijf.</EmptyNote>
        ) : (
          <DataTable
            head={['Plant', 'Locatie', 'Geplaatst', 'Status']}
            links={rows.map((plant) => `/portal/planten/${plant.id}`)}
            rows={rows.map((plant) => [
              plant.species && plant.nickname ? `${plantLabel(plant)} · ${plant.species}` : plantLabel(plant),
              plantPlace(plant),
              plant.installed_at ? formatDay(plant.installed_at) : '—',
              plantTag(plant),
            ])}
          />
        )}
      </Panel>
    </PortalShell>
  )
}
