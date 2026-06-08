import PortalShell, { PageHeading, Panel } from '@/components/portal-shell'

export const metadata = { title: 'Contract' }

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-stera-line px-5 py-3 text-sm last:border-0">
      <span className="text-stera-ink-soft">{k}</span>
      <span className="font-medium text-stera-green">{v}</span>
    </div>
  )
}

export default function Page() {
  return (
    <PortalShell active="/portal/contract" company="Bakkerij 't Stadshof">
      <PageHeading title="Onderhoudscontract" sub="De voorwaarden van je doorlopende samenwerking met Stera Pro." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Contractdetails">
          <Row k="Status" v="Actief" />
          <Row k="Looptijd" v="01 jan – 31 dec 2026" />
          <Row k="Frequentie" v="4-wekelijks onderhoud" />
          <Row k="Locaties" v="3" />
          <Row k="Maandbedrag" v="€ 145 / maand" />
        </Panel>
        <Panel title="Inbegrepen">
          <Row k="Watergeven, snoeien, voeden" v="✓" />
          <Row k="Vervanging zieke planten" v="✓" />
          <Row k="Seizoenswissel accenten" v="✓" />
          <Row k="Voorrang bij bestellingen" v="✓" />
        </Panel>
      </div>
    </PortalShell>
  )
}
