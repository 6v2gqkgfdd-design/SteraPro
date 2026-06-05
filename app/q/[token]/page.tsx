/**
 * Publieke goedkeuringspagina voor een klant-offerte.
 *
 * URL: /q/<signing_token>
 *
 * Geen authenticatie nodig — we leunen op de onvoorspelbare
 * signing_token in de URL en de SECURITY DEFINER RPC
 * `get_quote_for_signing` om de data publiek beschikbaar te maken.
 *
 * Layout volgt dezelfde 'Shell' als /sign/[token] zodat het visueel
 * consistent aanvoelt met de werkbon-goedkeuring.
 */

import Link from 'next/link'
import SteraLogo from '@/components/stera-logo'
import { createClient } from '@/lib/supabase/server'
import QuoteDecisionForm from './quote-decision-form'

export const dynamic = 'force-dynamic'

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return ''
  return new Date(value).toLocaleString('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatEur(cents: number | null | undefined) {
  const n = Number(cents ?? 0) / 100
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(n)
}

function formatRoom(name: string | null, floor: string | null) {
  if (!name && !floor) return ''
  if (!floor) return name ?? ''
  if (!name) return floor ?? ''
  return `${name} · ${floor}`
}

function formatRoomLabelSafe(
  name: string | null | undefined,
  floor: string | null | undefined
): string {
  return formatRoom(name ?? null, floor ?? null)
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink flex flex-col">
      <header className="px-5 py-5 sm:px-10 sm:py-8 border-b border-stera-line">
        <SteraLogo variant="default" href={null} />
      </header>
      <div className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
        <div className="mx-auto w-full max-w-3xl space-y-8">{children}</div>
      </div>
      <footer className="px-5 py-5 sm:px-10 text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera Pro · Plantbeheer voor professionals
      </footer>
    </main>
  )
}

// Helper voor de "Bekijk plant"-link op het voorstel.
function plantDetailHref(
  token: string,
  itemcode: string | null
): string | null {
  if (!itemcode) return null
  return `/q/${encodeURIComponent(token)}/item/${encodeURIComponent(itemcode)}`
}

type Line = {
  id: string
  line_type: string
  position: number
  supplier: string | null
  nieuwkoop_itemcode: string | null
  name: string
  description: string | null
  spec: string | null
  image_url: string | null
  unit_price_cents: number
  quantity: number
  line_total_cents: number
  customer_decision: 'accepted' | 'declined' | null
  customer_comment: string | null
  source_visit_plant_id: string | null
  old_plant_name: string | null
  old_plant_species: string | null
  old_plant_photo_url: string | null
  room_name: string | null
  room_floor: string | null
}

type RoomInfo = { name: string | null; floor: string | null }

type QuoteData = {
  id: string
  reference_number: string | null
  title: string | null
  status: string
  intro_note: string | null
  valid_until: string | null
  margin_pct: number | null
  subtotal_cents: number
  customer_name: string | null
  customer_email: string | null
  accepted_at: string | null
  accepted_name: string | null
  accepted_email: string | null
  declined_at: string | null
  created_at: string
  company: { name: string | null; contact_name: string | null } | null
  location: {
    name: string | null
    street: string | null
    number: string | null
    postal_code: string | null
    city: string | null
  } | null
  lines: Line[]
  rooms: RoomInfo[]
}

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_quote_for_signing', {
    _token: token,
  })

  if (error || !data) {
    return (
      <Shell>
        <div>
          <p className="stera-eyebrow text-stera-green mb-3">Offerte</p>
          <h1 className="text-3xl font-bold mb-3">
            Deze link is niet (meer) geldig
          </h1>
          <p className="text-base text-stera-ink-soft">
            De offerte is mogelijk al beantwoord, ingetrokken of de link bevat
            een fout. Vraag Stera Pro om je een nieuwe link te bezorgen.
          </p>
        </div>
      </Shell>
    )
  }

  const quote = data as unknown as QuoteData
  const lines = Array.isArray(quote.lines) ? quote.lines : []
  const company = quote.company
  const location = quote.location
  const alreadyDecided =
    quote.status === 'accepted' ||
    quote.status === 'declined' ||
    quote.status === 'ordered'

  // Unieke ruimtes (de RPC dedupliceert al via 'distinct' maar voor
  // alle zekerheid hier nog eens, gesorteerd op label).
  const roomLabelSet = new Set<string>()
  const roomLabels: string[] = []
  for (const r of quote.rooms ?? []) {
    const label = formatRoomLabelSafe(r.name, r.floor)
    if (label && !roomLabelSet.has(label)) {
      roomLabelSet.add(label)
      roomLabels.push(label)
    }
  }
  roomLabels.sort((a, b) => a.localeCompare(b, 'nl-BE'))

  return (
    <Shell>
      <div>
        <p className="stera-eyebrow text-stera-green mb-3">Offerte</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          {quote.title || 'Plantvoorstel'}
        </h1>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-stera-ink-soft">
          {quote.reference_number ? (
            <span className="font-mono">{quote.reference_number}</span>
          ) : null}
          {quote.valid_until ? (
            <span>geldig tot {formatDate(quote.valid_until)}</span>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 text-sm">
        <div>
          <p className="stera-eyebrow text-stera-green mb-1">Voor</p>
          <p className="font-semibold">{company?.name || quote.customer_name || '—'}</p>
          {company?.contact_name ? (
            <p className="text-stera-ink-soft">{company.contact_name}</p>
          ) : null}
        </div>
        <div>
          <p className="stera-eyebrow text-stera-green mb-1">Locatie</p>
          <p className="font-semibold">{location?.name || '—'}</p>
          {location?.street ? (
            <p className="text-stera-ink-soft">
              {[location.street, location.number].filter(Boolean).join(' ')}
              {location.postal_code || location.city ? (
                <>
                  <br />
                  {[location.postal_code, location.city]
                    .filter(Boolean)
                    .join(' ')}
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      {roomLabels.length > 0 ? (
        <section>
          <p className="stera-eyebrow text-stera-green mb-2">
            Ruimtes in deze offerte
          </p>
          <div className="flex flex-wrap gap-2">
            {roomLabels.map((label) => (
              <span
                key={label}
                className="inline-block rounded-full bg-stera-green/10 px-3 py-1 text-xs font-medium text-stera-green"
              >
                {label}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {quote.intro_note ? (
        <section className="rounded-xl border border-stera-line bg-white p-5 text-sm whitespace-pre-wrap">
          {quote.intro_note}
        </section>
      ) : null}

      {alreadyDecided ? (
        <div
          className={`rounded-xl border p-6 ${
            quote.status === 'accepted' || quote.status === 'ordered'
              ? 'border-stera-green/40 bg-stera-green/5'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <p
            className={`stera-eyebrow mb-2 ${
              quote.status === 'accepted' || quote.status === 'ordered'
                ? 'text-stera-green'
                : 'text-red-700'
            }`}
          >
            {quote.status === 'accepted' || quote.status === 'ordered'
              ? 'Goedgekeurd'
              : 'Afgewezen'}
          </p>
          <p className="text-sm">
            {quote.status === 'accepted' || quote.status === 'ordered' ? (
              <>
                Deze offerte werd goedgekeurd door{' '}
                <strong>{quote.accepted_name || 'klant'}</strong>
                {quote.accepted_at ? (
                  <> op {formatDateTime(quote.accepted_at)}.</>
                ) : null}
              </>
            ) : (
              <>
                Deze offerte werd afgewezen
                {quote.declined_at ? (
                  <> op {formatDateTime(quote.declined_at)}.</>
                ) : null}
              </>
            )}
          </p>
        </div>
      ) : null}

      <section>
        <p className="stera-eyebrow text-stera-green mb-2">
          Voorgestelde regels ({lines.filter((l) => l.line_type !== 'transport').length})
        </p>
        <p className="mb-4 text-sm text-stera-ink-soft">
          {alreadyDecided
            ? 'Hieronder zie je wat de klant aanvinkte.'
            : 'Standaard staan alle regels op akkoord. Zet onderstaande knop op "Niet akkoord" voor wat je niet wil.'}
        </p>

        {/* Het formulier neemt de planten- en pot-regels mee. Transport
            wordt apart getoond — daar kan de klant niets aan weigeren. */}
        {alreadyDecided ? (
          <ReadonlyLineList
            lines={lines.filter((l) => l.line_type !== 'transport')}
            token={token}
          />
        ) : (
          <QuoteDecisionForm
            token={token}
            initialLines={lines.filter((l) => l.line_type !== 'transport')}
            transportLines={lines.filter((l) => l.line_type === 'transport')}
          />
        )}
      </section>
    </Shell>
  )
}

function ReadonlyLineList({
  lines,
  token,
}: {
  lines: Line[]
  token: string
}) {
  return (
    <ul className="space-y-3">
      {lines.map((line) => {
        const decided = line.customer_decision
        const accepted = decided === 'accepted'
        const declined = decided === 'declined'
        return (
          <li
            key={line.id}
            className={`rounded-xl border p-4 ${
              accepted
                ? 'border-stera-green/40 bg-stera-green/5'
                : declined
                ? 'border-red-200 bg-red-50/50'
                : 'border-stera-line bg-white'
            }`}
          >
            <LineSummary line={line} token={token} />
            {decided ? (
              <p
                className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium ${
                  accepted
                    ? 'bg-stera-green/15 text-stera-green'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {accepted ? 'Akkoord' : 'Niet akkoord'}
              </p>
            ) : null}
            {line.customer_comment ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-stera-ink-soft">
                {line.customer_comment}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function LineSummary({ line, token }: { line: Line; token: string }) {
  const room = formatRoom(line.room_name, line.room_floor)
  const oldPlantName =
    line.old_plant_name || line.old_plant_species || null
  const detailHref = plantDetailHref(token, line.nieuwkoop_itemcode)
  return (
    <div>
      {oldPlantName ? (
        <div className="mb-3 border-b border-stera-line/70 pb-3">
          <p className="stera-eyebrow text-stera-green mb-1">
            Vervangt
          </p>
          <div className="flex items-center gap-3">
            {line.old_plant_photo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={line.old_plant_photo_url}
                alt={`Huidige plant: ${oldPlantName}`}
                loading="lazy"
                className="h-16 w-16 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-[10px] text-stera-ink-soft">
                geen foto
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-stera-ink">{oldPlantName}</p>
              {line.old_plant_species && line.old_plant_name ? (
                <p className="text-xs italic text-stera-ink-soft">
                  {line.old_plant_species}
                </p>
              ) : null}
              {room ? (
                <p className="mt-0.5 text-xs text-stera-ink-soft">
                  📍 {room}
                </p>
              ) : null}
            </div>
            <span aria-hidden className="shrink-0 text-2xl text-stera-green/60">
              →
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {detailHref ? (
          <Link
            href={detailHref}
            className="shrink-0 rounded transition hover:opacity-80"
          >
            {line.image_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={line.image_url}
                alt={line.name}
                loading="lazy"
                className="h-24 w-24 rounded object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded border border-dashed border-stera-line text-xs text-stera-ink-soft">
                geen foto
              </div>
            )}
          </Link>
        ) : line.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={line.image_url}
            alt={line.name}
            loading="lazy"
            className="h-24 w-24 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-xs text-stera-ink-soft">
            geen foto
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="stera-eyebrow text-stera-green mb-1 text-[10px]">
            Voorstel
          </p>
          {detailHref ? (
            <Link
              href={detailHref}
              className="font-semibold leading-tight text-stera-ink hover:text-stera-green hover:underline"
            >
              {line.name}
            </Link>
          ) : (
            <p className="font-semibold leading-tight">{line.name}</p>
          )}
          {line.spec ? (
            <p className="text-xs text-stera-ink-soft">{line.spec}</p>
          ) : null}
          {line.description ? (
            <p className="mt-1 text-xs text-stera-ink-soft whitespace-pre-wrap">
              {line.description}
            </p>
          ) : null}
          {detailHref ? (
            <Link
              href={detailHref}
              className="mt-1 inline-block text-xs text-stera-green underline-offset-4 hover:underline"
            >
              Bekijk details →
            </Link>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums">
            {formatEur(line.line_total_cents)}
          </p>
          {line.quantity > 1 ? (
            <p className="text-xs text-stera-ink-soft">
              {line.quantity} × {formatEur(line.unit_price_cents)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// Klein hulptype zodat de form-component het type kent. We exporteren
// het hier en gebruiken het ook in quote-decision-form.tsx.
export type PublicQuoteLine = Line
