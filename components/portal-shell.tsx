import { mspHref, mspStore } from '@/lib/msp-request'

/**
 * Inhoud van Mijn SteraPro. Geen eigen header, zijbalk of footer:
 * op sterapro.be zet theme.liquid die eromheen. Navigatie is een rij
 * gewone links (geen Next-clientnavigatie), zodat elk item ook via
 * de App Proxy een echte pagina opent.
 */

type NavItem = { href: string; label: string }
const NAV: NavItem[] = [
  { href: '/portal/dashboard', label: 'Overzicht' },
  { href: '/portal/onderhoud', label: 'Onderhoud' },
  { href: '/portal/planten', label: 'Mijn planten' },
  { href: '/portal/leveringen', label: 'Leveringen' },
  { href: '/portal/contract', label: 'Contract' },
  { href: '/portal/aanvraag', label: 'Nieuwe planten' },
  { href: '/portal/offertes', label: 'Offertes' },
  { href: '/portal/bestellingen', label: 'Bestellingen' },
  { href: '/portal/facturen', label: 'Facturen' },
]

export default function PortalShell({
  active,
  demo = false,
  children,
}: {
  active: string
  company?: string
  demo?: boolean
  children: React.ReactNode
}) {
  const showDemo = demo || mspStore().demo
  return (
    <div className="msp-root">
      <nav className="msp-nav" aria-label="Mijn SteraPro">
        {NAV.map((item) => {
          const on = item.href === active
          return (
            <a key={item.href} href={mspHref(item.href)} aria-current={on ? 'page' : undefined}>
              {item.label}
            </a>
          )
        })}
      </nav>
      {showDemo ? (
        <p className="msp-banner">
          Voorbeeld · Demo Kantoor. Dit zijn fictieve gegevens, geen echte klant.{' '}
          <a className="msp-link" href={mspStore().base.startsWith('/apps/') ? '/apps/mijn' : '/portal/demo/uit'}>
            Voorbeeld sluiten
          </a>
        </p>
      ) : null}
      {children}
    </div>
  )
}

export function SchemaNotice() {
  return (
    <p className="msp-banner">
      De koppeling met je bedrijfsgegevens is op deze omgeving nog niet geactiveerd.
      Na de portaal-migratie verschijnen hier de gegevens van je bedrijf.
    </p>
  )
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="msp-pad">{children}</p>
}

export function PageHeading({ title, kicker, sub }: { title: string; kicker?: string; sub?: string }) {
  return (
    <div className="msp-head">
      <div>
        {kicker ? <p className="msp-kicker">{kicker}</p> : null}
        <h1 className="msp-title">{title}</h1>
        {sub ? <p className="msp-lead">{sub}</p> : null}
      </div>
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="msp-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </div>
  )
}

export function Panel({ title, children }: { title: string; source?: string; children: React.ReactNode }) {
  return (
    <section className="msp-panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

type Cell = string | { tag: 'ok' | 'plan' | 'let' | 'alarm' | 'neutraal'; text: string }

function CellView({ cell, href }: { cell: Cell; href?: string | null }) {
  if (typeof cell !== 'string') {
    return <span className={`msp-badge msp-badge-${cell.tag}`}>{cell.text}</span>
  }
  if (href) return <a className="msp-link" href={mspHref(href)}>{cell}</a>
  return <>{cell}</>
}

export function DataTable({
  head,
  rows,
  links,
}: {
  head: string[]
  rows: Cell[][]
  links?: Array<string | null>
}) {
  return (
    <>
      <div className="msp-cards">
        {rows.map((row, i) => {
          const body = (
            <>
              <b>{typeof row[0] === 'string' ? row[0] : row[0].text}</b>
              {row.slice(1).map((cell, j) => (
                <small key={j}>
                  {head[j + 1] ? `${head[j + 1]}: ` : ''}
                  {typeof cell === 'string' ? cell : cell.text}
                </small>
              ))}
            </>
          )
          return links?.[i] ? (
            <a key={i} className="msp-rowcard" href={mspHref(links[i]!)}>
              {body}
            </a>
          ) : (
            <div key={i} className="msp-rowcard">
              {body}
            </div>
          )
        })}
      </div>
      <table className="msp-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>
                  <CellView cell={cell} href={j === 0 ? links?.[i] : null} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
