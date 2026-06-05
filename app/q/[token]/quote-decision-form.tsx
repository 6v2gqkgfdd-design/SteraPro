'use client'

/**
 * Klant-offerte goedkeuringsformulier.
 *
 *  - Per regel: Akkoord / Niet akkoord toggle + optioneel commentaar.
 *  - Live aangepast totaal bovenaan + onderaan (sticky bar op mobiel).
 *  - Onderaan: naam, email, handtekening, "Bevestig keuzes"-knop.
 *
 * Bij submit roept hij de server action `submitQuoteDecision` aan,
 * die op zijn beurt de RPC `submit_quote_decision` aanroept.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { PublicQuoteLine } from './page'
import { submitQuoteDecision } from './actions'
import DeliveryIllustration from '@/components/delivery-illustration'
import { createClient } from '@/lib/supabase/client'

type ComboResult = {
  itemcode: string
  description: string | null
  suggested_sale_price: number | null
  height: number | null
  diameter: number | null
  has_image: boolean | null
}

type Decision = 'accepted' | 'declined'

function formatEur(cents: number) {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function formatRoom(name: string | null, floor: string | null) {
  if (!name && !floor) return ''
  if (!floor) return name ?? ''
  if (!name) return floor ?? ''
  return `${name} · ${floor}`
}

export default function QuoteDecisionForm({
  token,
  initialLines,
  transportLines = [],
}: {
  token: string
  initialLines: PublicQuoteLine[]
  /** Niet-beslisbare transport-regels (worden altijd meegerekend). */
  transportLines?: PublicQuoteLine[]
}) {
  // Per regel: beslissing (default 'accepted') + commentaar.
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() => {
    const map: Record<string, Decision> = {}
    for (const line of initialLines) {
      map[line.id] = (line.customer_decision as Decision) ?? 'accepted'
    }
    return map
  })
  const [comments, setComments] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const line of initialLines) {
      map[line.id] = line.customer_comment ?? ''
    }
    return map
  })

  // De regels staan in state zodat een gewijzigd voorstel (en de prijs)
  // meteen zichtbaar wordt.
  const [lines, setLines] = useState<PublicQuoteLine[]>(initialLines)

  // --- Catalogus-picker (klant kiest zelf een ander voorstel/merk) ---
  const supabase = useMemo(() => createClient(), [])
  const [pickerLineId, setPickerLineId] = useState<string | null>(null)
  const [pq, setPq] = useState('')
  const [pbrand, setPbrand] = useState('')
  const [presults, setPresults] = useState<ComboResult[]>([])
  const [ploading, setPloading] = useState(false)
  const [perror, setPerror] = useState('')
  const [savingItemcode, setSavingItemcode] = useState<string | null>(null)
  const [brandOptions, setBrandOptions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('list_catalog_brands')
      .then(({ data }: { data: unknown }) => {
        if (cancelled) return
        if (Array.isArray(data)) setBrandOptions(data as string[])
      })
    return () => {
      cancelled = true
    }
  }, [supabase])

  async function runPickerSearch(q: string, brand: string) {
    setPloading(true)
    setPerror('')
    const { data, error } = await supabase.rpc('search_catalog_combinations', {
      _q: q.trim(),
      _light: '',
      _pot_min: null,
      _pot_max: null,
      _brand: brand,
    })
    setPloading(false)
    if (error) {
      setPresults([])
      setPerror('Zoeken mislukt. Probeer opnieuw.')
      return
    }
    setPresults((data as ComboResult[]) ?? [])
  }

  function openPicker(lineId: string) {
    setPickerLineId(lineId)
    setPq('')
    setPbrand('')
    setPresults([])
    setPerror('')
    runPickerSearch('', '')
  }

  async function chooseCombo(item: ComboResult) {
    if (!pickerLineId) return
    setSavingItemcode(item.itemcode)
    setPerror('')
    const { data, error } = await supabase.rpc('update_quote_line_item', {
      _token: token,
      _line_id: pickerLineId,
      _itemcode: item.itemcode,
    })
    setSavingItemcode(null)
    if (error || !data) {
      setPerror('Wijzigen mislukt. Mogelijk is de offerte al beantwoord.')
      return
    }
    const updated = data as {
      id: string
      name: string
      spec: string | null
      image_url: string | null
      unit_price_cents: number
      quantity: number
      line_total_cents: number
      nieuwkoop_itemcode: string | null
    }
    setLines((prev) =>
      prev.map((l) =>
        l.id === updated.id
          ? {
              ...l,
              name: updated.name,
              spec: updated.spec,
              image_url: updated.image_url,
              unit_price_cents: updated.unit_price_cents,
              line_total_cents: updated.line_total_cents,
              nieuwkoop_itemcode: updated.nieuwkoop_itemcode,
              description: null,
            }
          : l
      )
    )
    setPickerLineId(null)
  }

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<null | {
    status: Decision
    accepted: number
    declined: number
  }>(null)

  // Aangepast totaal op basis van wat de klant heeft aangevinkt +
  // de transport-regel(s) die altijd meelopen.
  const liveTotalCents = useMemo(() => {
    let sum = 0
    for (const line of lines) {
      if (decisions[line.id] === 'accepted') {
        sum += line.line_total_cents
      }
    }
    for (const t of transportLines) {
      sum += t.line_total_cents
    }
    return sum
  }, [decisions, lines, transportLines])

  const transportTotalCents = useMemo(
    () => transportLines.reduce((s, t) => s + t.line_total_cents, 0),
    [transportLines]
  )

  const acceptedCount = useMemo(
    () => Object.values(decisions).filter((d) => d === 'accepted').length,
    [decisions]
  )

  // --- Handtekening canvas ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const hasInk = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineWidth = 2.2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1c2924'
  }, [])

  function pointerPos(ev: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
  }
  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    ev.preventDefault()
    canvasRef.current?.setPointerCapture(ev.pointerId)
    drawing.current = true
    lastPoint.current = pointerPos(ev)
  }
  function onPointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !lastPoint.current) return
    const next = pointerPos(ev)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    lastPoint.current = next
    hasInk.current = true
  }
  function onPointerUp() {
    drawing.current = false
    lastPoint.current = null
  }
  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, rect.width, rect.height)
    hasInk.current = false
  }

  // --- Submit ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Vul je naam in.')
      return
    }
    if (!hasInk.current) {
      setError('Plaats eerst je handtekening in het kader hierboven.')
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const comma = dataUrl.indexOf(',')
    const signature = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl

    const payload = lines.map((line) => ({
      id: line.id,
      decision: decisions[line.id] ?? 'accepted',
      comment: (comments[line.id] ?? '').trim(),
    }))

    setSubmitting(true)
    const res = await submitQuoteDecision({
      token,
      name: name.trim(),
      email: email.trim(),
      signature,
      decisions: payload,
    })
    setSubmitting(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setSuccess({
      status: res.status,
      accepted: res.accepted_count,
      declined: res.declined_count,
    })
  }

  if (success) {
    return (
      <div
        className={`rounded-xl border p-6 ${
          success.status === 'accepted'
            ? 'border-stera-green/40 bg-stera-green/5'
            : 'border-red-200 bg-red-50'
        }`}
      >
        <p
          className={`stera-eyebrow mb-2 ${
            success.status === 'accepted' ? 'text-stera-green' : 'text-red-700'
          }`}
        >
          {success.status === 'accepted' ? 'Bedankt' : 'Geregistreerd'}
        </p>
        <h2 className="text-xl font-semibold">
          {success.status === 'accepted'
            ? 'Offerte goedgekeurd'
            : 'Offerte afgewezen'}
        </h2>
        <p className="mt-2 text-sm text-stera-ink-soft">
          {success.status === 'accepted'
            ? `Je hebt ${success.accepted} regel${
                success.accepted === 1 ? '' : 's'
              } goedgekeurd${
                success.declined > 0
                  ? ` en ${success.declined} afgewezen`
                  : ''
              }. Stera Pro ontvangt automatisch een melding en gaat met je bestelling aan de slag.`
            : 'Je keuzes zijn doorgegeven aan Stera Pro. We nemen contact met je op om de aanpassingen te bespreken.'}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ul className="space-y-3">
        {lines.map((line) => {
          const decision = decisions[line.id] ?? 'accepted'
          const room = formatRoom(line.room_name, line.room_floor)
          const oldPlantName =
            line.old_plant_name || line.old_plant_species || null
          const detailHref = line.nieuwkoop_itemcode
            ? `/q/${encodeURIComponent(token)}/item/${encodeURIComponent(line.nieuwkoop_itemcode)}`
            : null
          return (
            <li
              key={line.id}
              className={`rounded-xl border p-4 transition ${
                decision === 'declined'
                  ? 'border-red-200 bg-red-50/50'
                  : 'border-stera-line bg-white'
              }`}
            >
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
                      <p className="font-medium text-stera-ink">
                        {oldPlantName}
                      </p>
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
                    <span
                      aria-hidden
                      className="shrink-0 text-2xl text-stera-green/60"
                    >
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

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    decision === 'accepted'
                      ? 'border-stera-green bg-stera-green/10 text-stera-green'
                      : 'border-stera-line bg-white text-stera-ink-soft hover:border-stera-green'
                  }`}
                >
                  <input
                    type="radio"
                    name={`decision-${line.id}`}
                    className="sr-only"
                    checked={decision === 'accepted'}
                    onChange={() =>
                      setDecisions((d) => ({ ...d, [line.id]: 'accepted' }))
                    }
                  />
                  ✓ Akkoord
                </label>
                <label
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    decision === 'declined'
                      ? 'border-red-400 bg-red-100 text-red-700'
                      : 'border-stera-line bg-white text-stera-ink-soft hover:border-red-300'
                  }`}
                >
                  <input
                    type="radio"
                    name={`decision-${line.id}`}
                    className="sr-only"
                    checked={decision === 'declined'}
                    onChange={() =>
                      setDecisions((d) => ({ ...d, [line.id]: 'declined' }))
                    }
                  />
                  ✗ Niet akkoord
                </label>
              </div>

              {line.nieuwkoop_itemcode ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() =>
                      pickerLineId === line.id
                        ? setPickerLineId(null)
                        : openPicker(line.id)
                    }
                    className="text-xs font-medium text-stera-green underline-offset-4 hover:underline"
                  >
                    {pickerLineId === line.id
                      ? 'Sluit keuzelijst'
                      : 'Liever een ander voorstel? Kies zelf →'}
                  </button>

                  {pickerLineId === line.id ? (
                    <div className="mt-3 rounded-lg border border-stera-line bg-stera-cream/40 p-3">
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={pq}
                          onChange={(e) => setPq(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              runPickerSearch(pq, pbrand)
                            }
                          }}
                          placeholder="Zoek op naam..."
                          className="min-w-0 flex-1 rounded-lg border border-stera-line bg-white p-2 text-sm"
                        />
                        <select
                          value={pbrand}
                          onChange={(e) => {
                            setPbrand(e.target.value)
                            runPickerSearch(pq, e.target.value)
                          }}
                          className="rounded-lg border border-stera-line bg-white p-2 text-sm"
                          title="Stijl / merk van de pot"
                        >
                          <option value="">Alle stijlen</option>
                          {brandOptions.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => runPickerSearch(pq, pbrand)}
                          className="rounded-lg border border-stera-line bg-white px-3 py-2 text-sm hover:bg-stera-cream"
                        >
                          Zoek
                        </button>
                      </div>

                      {perror ? (
                        <p className="mt-2 text-xs text-red-600">{perror}</p>
                      ) : null}

                      {ploading ? (
                        <p className="mt-3 text-xs text-stera-ink-soft">Laden…</p>
                      ) : (
                        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {presults.map((it) => (
                            <li
                              key={it.itemcode}
                              className="overflow-hidden rounded-lg border border-stera-line bg-white"
                            >
                              <div className="aspect-square bg-stera-cream/40">
                                {it.has_image ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={`/api/nieuwkoop/image/${it.itemcode}`}
                                    alt={it.description ?? ''}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                  />
                                ) : null}
                              </div>
                              <div className="p-2">
                                <p className="line-clamp-2 text-xs font-medium text-stera-ink">
                                  {it.description}
                                </p>
                                <p className="mt-0.5 text-xs text-stera-ink-soft">
                                  {formatEur(
                                    Math.round(
                                      (it.suggested_sale_price ?? 0) * 100
                                    )
                                  )}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => chooseCombo(it)}
                                  disabled={savingItemcode === it.itemcode}
                                  className="mt-1 w-full rounded-md bg-stera-green px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                                >
                                  {savingItemcode === it.itemcode
                                    ? 'Bezig…'
                                    : 'Kies deze'}
                                </button>
                              </div>
                            </li>
                          ))}
                          {!ploading && presults.length === 0 ? (
                            <li className="col-span-full text-xs text-stera-ink-soft">
                              Geen resultaten.
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <textarea
                value={comments[line.id] ?? ''}
                onChange={(e) =>
                  setComments((c) => ({ ...c, [line.id]: e.target.value }))
                }
                rows={2}
                placeholder={
                  decision === 'declined'
                    ? 'Optioneel: waarom niet akkoord?'
                    : 'Optioneel: een opmerking voor Stera Pro'
                }
                className="mt-3 w-full rounded-lg border border-stera-line bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-stera-green/30"
              />
            </li>
          )
        })}
      </ul>

      {/* Transport — vaste regel, geen accept/decline. */}
      {transportLines.length > 0 ? (
        <div className="rounded-xl border border-stera-line bg-white p-4">
          <p className="stera-eyebrow text-stera-green mb-2 text-[10px]">
            Levering
          </p>
          {transportLines.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-3"
            >
              <DeliveryIllustration className="h-16 w-20 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{t.name}</p>
                {t.description ? (
                  <p className="mt-0.5 text-xs text-stera-ink-soft">
                    {t.description}
                  </p>
                ) : null}
              </div>
              <p className="font-semibold tabular-nums">
                {t.line_total_cents === 0
                  ? 'Gratis'
                  : formatEur(t.line_total_cents)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Live totaal */}
      <div className="rounded-xl border border-stera-green/30 bg-stera-green/5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="stera-eyebrow text-stera-green">Aangepast totaal</p>
            <p className="text-xs text-stera-ink-soft">
              {acceptedCount} van de {initialLines.length} regels akkoord
              {transportLines.length > 0 && transportTotalCents > 0
                ? ` + levering`
                : transportLines.length > 0
                ? ` + gratis levering`
                : ''}{' '}
              · prijzen excl. btw
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {formatEur(liveTotalCents)}
          </p>
        </div>
      </div>

      <hr className="border-stera-line" />

      {/* Naam + email + handtekening */}
      <div className="space-y-5">
        <div>
          <p className="stera-eyebrow text-stera-green mb-2">Handtekening</p>
          <p className="mb-3 text-xs text-stera-ink-soft">
            Teken hieronder met je vinger of muis. Klik op &ldquo;Wissen&rdquo;
            als je opnieuw wil beginnen.
          </p>
          <div
            className="rounded-xl border border-stera-line bg-white"
            style={{ touchAction: 'none' }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className="block h-40 w-full sm:h-48"
            />
          </div>
          <button
            type="button"
            onClick={clearSignature}
            className="mt-2 text-sm text-stera-green underline-offset-4 hover:underline"
          >
            Wissen
          </button>
        </div>

        <div className="space-y-2">
          <label htmlFor="approver_name" className="block text-sm font-medium">
            Volledige naam
          </label>
          <input
            id="approver_name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Voor- en achternaam"
            className="w-full rounded-lg border border-stera-line bg-white p-3 text-base"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="approver_email"
            className="block text-sm font-medium"
          >
            E-mail (optioneel)
          </label>
          <input
            id="approver_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="zodat Stera Pro je een bevestiging kan sturen"
            className="w-full rounded-lg border border-stera-line bg-white p-3 text-base"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="stera-cta stera-cta-primary w-full sm:w-auto disabled:opacity-50"
      >
        {submitting
          ? 'Versturen...'
          : acceptedCount === 0
          ? 'Offerte afwijzen →'
          : 'Bevestig keuzes en onderteken →'}
      </button>
    </form>
  )
}
