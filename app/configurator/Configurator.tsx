'use client'

import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react'
import {
  CFG_PLANTS, CFG_POTS, CFG_Q, CFG_STEPS,
  type CfgPlant, type CfgPotLine,
} from './data'

/* ── Kleuren (1:1 met het website-design) ─────────────── */
const C = {
  creme: '#FFFDF7', sand: '#EEE9DC', green: '#426F52', deep: '#2F5840', ink: '#23322B',
  mut: 'rgba(35,50,43,.62)', mutLight: 'rgba(255,253,247,.72)', line: 'rgba(47,88,64,.16)',
  serif: 'var(--font-instrument-serif), Georgia, serif',
  sans: 'var(--font-instrument-sans), ui-sans-serif, system-ui, sans-serif',
}

/* ── Iconen ────────────────────────────────────────────── */
type IcoProps = { size?: number; sw?: number; style?: CSSProperties }
function Ico({ d, size = 16, sw = 1.6, style }: IcoProps & { d: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>{d}</svg>
  )
}
const IcoCheck = (p: IcoProps) => <Ico {...p} d={<path d="m5 13 4 4L19 7" />} />
const IcoArrow = (p: IcoProps) => <Ico {...p} d={<path d="M4 12h16m-6-6 6 6-6 6" />} />
const IcoLock = (p: IcoProps) => <Ico {...p} d={<g><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></g>} />
const IcoCal = (p: IcoProps) => <Ico {...p} d={<g><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M8 3v4m8-4v4" /></g>} />
const IcoCart = (p: IcoProps) => <Ico {...p} d={<g><path d="M3 4h2l2.4 12.2A2 2 0 0 0 9.36 18h8.1a2 2 0 0 0 1.95-1.57L21 9H6" /><circle cx="9.5" cy="21" r="1" /><circle cx="17.5" cy="21" r="1" /></g>} />

/* ── Sectiekop ─────────────────────────────────────────── */
function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <div>
      <div style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 12.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.green }}>{kicker}</div>
      <h1 style={{ margin: '14px 0 0', fontFamily: C.serif, fontStyle: 'italic', fontWeight: 400, fontSize: 42, lineHeight: 1.12, color: C.deep }}>{title}</h1>
      <p style={{ margin: '12px 0 0', fontFamily: C.sans, fontSize: 16.5, lineHeight: 1.6, maxWidth: 640, color: C.mut }}>{sub}</p>
    </div>
  )
}

/* ── Stap-onderdelen ───────────────────────────────────── */
function Option({ active, title, desc, badge, onClick }: { active: boolean; title: string; desc: string; badge?: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      flex: 1, minWidth: 220, cursor: 'pointer', background: active ? C.deep : '#fff',
      border: `1.5px solid ${active ? C.deep : C.line}`, borderRadius: 14, padding: '20px 22px',
      transition: 'all .15s ease', position: 'relative',
    }}>
      {badge && <span style={{
        position: 'absolute', top: -11, right: 14, fontFamily: C.sans, fontWeight: 700, fontSize: 11,
        letterSpacing: '0.08em', textTransform: 'uppercase', background: '#C3CCA6', color: C.ink, borderRadius: 999, padding: '4px 10px',
      }}>{badge}</span>}
      <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 16, color: active ? C.creme : C.deep }}>{title}</div>
      <div style={{ fontFamily: C.sans, fontSize: 13.5, lineHeight: 1.5, marginTop: 5, color: active ? C.mutLight : C.mut }}>{desc}</div>
    </div>
  )
}

function Stepper({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      {CFG_STEPS.map((s, i) => (
        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {i > 0 && <span style={{ width: 28, height: 1.5, background: i <= step ? C.green : C.line }} />}
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: C.sans, fontWeight: 600, fontSize: 13,
              background: i < step ? C.green : i === step ? C.deep : 'transparent',
              color: i <= step ? C.creme : C.mut, border: i > step ? `1.5px solid ${C.line}` : 'none',
            }}>{i < step ? <IcoCheck size={14} /> : i + 1}</span>
            <span style={{ fontFamily: C.sans, fontSize: 13.5, fontWeight: i === step ? 600 : 500, color: i === step ? C.deep : C.mut }}>{s}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

function PlantCard({ p, perfect, selected, onToggle }: { p: CfgPlant; perfect: boolean; selected: boolean; onToggle: () => void }) {
  return (
    <div onClick={onToggle} style={{
      width: 'calc(25% - 15px)', minWidth: 200, cursor: 'pointer', background: '#fff', borderRadius: 14, overflow: 'hidden',
      border: `2px solid ${selected ? C.green : C.line}`, position: 'relative', transition: 'border-color .15s ease',
    }}>
      {perfect && <span style={{
        position: 'absolute', top: 10, left: 10, zIndex: 2, fontFamily: C.sans, fontWeight: 700, fontSize: 11,
        letterSpacing: '0.06em', textTransform: 'uppercase', background: C.deep, color: C.creme, borderRadius: 999, padding: '5px 11px',
      }}>Beste match</span>}
      <span style={{
        position: 'absolute', top: 10, right: 10, zIndex: 2, width: 26, height: 26, borderRadius: '50%',
        background: selected ? C.green : 'rgba(255,255,255,.9)', border: selected ? 'none' : `1.5px solid ${C.line}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.creme,
      }}>{selected && <IcoCheck size={15} />}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.img} alt={p.name} style={{ width: '100%', height: 190, objectFit: 'cover', display: 'block' }} />
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 15.5, color: C.ink }}>{p.name}</div>
        <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.mut, marginTop: 2, fontStyle: 'italic' }}>{p.latin}</div>
        <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.mut, marginTop: 8 }}>↕ {p.h} cm · Ø {p.pot} cm · {'●'.repeat(p.care)}{'○'.repeat(3 - p.care)} zorg</div>
      </div>
    </div>
  )
}

function PotCard({ pot, selColor, onPick }: { pot: CfgPotLine; selColor: string | null; onPick: (kleur: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 240, background: '#fff', border: `2px solid ${selColor ? C.green : C.line}`, borderRadius: 16, padding: '24px 26px' }}>
      <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 17, color: C.deep }}>{pot.name}</div>
      <div style={{ fontFamily: C.sans, fontSize: 13.5, color: C.mut, marginTop: 4 }}>{pot.note}</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        {pot.colors.map(([label, hex]) => (
          <div key={label} onClick={() => onPick(label)} style={{ cursor: 'pointer', textAlign: 'center' }}>
            <span style={{
              width: 44, height: 44, borderRadius: '50%', background: hex, display: 'inline-block', boxSizing: 'border-box',
              border: selColor === label ? `3px solid ${C.green}` : `1.5px solid ${C.line}`,
              boxShadow: selColor === label ? `0 0 0 3px ${C.creme}, 0 0 0 5px ${C.green}` : 'none',
            }} />
            <div style={{ fontFamily: C.sans, fontSize: 11.5, color: selColor === label ? C.deep : C.mut, fontWeight: selColor === label ? 600 : 400, marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Hoofdcomponent ────────────────────────────────────── */
const CFG_LS = 'stera-configurator-v1'
type SavedState = {
  step?: number
  ans?: Record<string, string | number>
  picked?: string[]
  pot?: { lijn: string; kleur: string } | null
}
function loadState(): SavedState {
  if (typeof window === 'undefined') return {}
  try { return (JSON.parse(localStorage.getItem(CFG_LS) || '{}') as SavedState) || {} } catch { return {} }
}

export default function Configurator() {
  const [step, setStep] = useState<number>(() => loadState().step ?? 0)
  const [ans, setAns] = useState<Record<string, string | number>>(() => loadState().ans ?? {})
  const [picked, setPicked] = useState<string[]>(() => loadState().picked ?? [])
  const [pot, setPot] = useState<{ lijn: string; kleur: string } | null>(() => loadState().pot ?? null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    localStorage.setItem(CFG_LS, JSON.stringify({ step, ans, picked, pot }))
  }, [step, ans, picked, pot])

  // Hoogte naar de Shopify-pagina sturen zodat de iframe meegroeit (naadloze embed).
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return
    const post = () => window.parent.postMessage({ type: 'stera-cfg-height', height: document.documentElement.scrollHeight }, '*')
    post()
    const ro = new ResizeObserver(post)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [step])

  const answered = CFG_Q.every((q) => ans[q.key] !== undefined)

  const matches = useMemo(() => {
    if (!answered) return [] as { p: CfgPlant; perfect: boolean }[]
    const fit = CFG_PLANTS.filter((p) =>
      (p.light as string[]).includes(String(ans.light)) &&
      (p.humid as string[]).includes(String(ans.humid)) &&
      (ans.care === 3 || p.care <= Number(ans.care)) && p.size === ans.size)
    const near = CFG_PLANTS.filter((p) => !fit.includes(p) &&
      (p.light as string[]).includes(String(ans.light)) &&
      (p.humid as string[]).includes(String(ans.humid)) &&
      (ans.care === 3 || p.care <= Number(ans.care)))
    return [...fit.map((p) => ({ p, perfect: true })), ...near.map((p) => ({ p, perfect: false }))]
  }, [ans, answered])

  const selPlants = CFG_PLANTS.filter((p) => picked.includes(p.id))
  const potLine = pot ? CFG_POTS.find((x) => x.id === pot.lijn) : null
  const reset = () => { setStep(0); setAns({}); setPicked([]); setPot(null) }

  // Navigeer het TOP-venster: breekt uit de Shopify-iframe naar het echte mandje.
  const goTop = (url: string) => {
    try { (window.top ?? window).location.assign(url) } catch { window.location.assign(url) }
  }

  async function addToCart() {
    if (!selPlants.length || !pot || adding) return
    setAdding(true)
    try {
      const res = await fetch('/api/configurator/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: selPlants.map((p) => ({ handle: p.shopifyHandle, name: p.name, qty: 1 })),
          pot: potLine ? { lijn: potLine.name, kleur: pot.kleur } : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.url) { goTop(data.url as string); return }
      alert(data?.error || 'Het winkelmandje kon niet worden geopend. Probeer later opnieuw of vraag een offerte aan.')
    } catch {
      alert('Er ging iets mis bij het toevoegen aan het winkelmandje.')
    } finally {
      setAdding(false)
    }
  }

  function requestQuote() {
    const lines = selPlants
      .map((p) => `- ${p.name} (${p.latin})${potLine ? ` — ${potLine.name} '${pot?.kleur}', Ø ${p.pot + 6} cm` : ''}`)
      .join('\n')
    const body = `Hallo Stera Pro,\n\nVia de plantconfigurator stelde ik deze selectie samen:\n\n${lines || '(geen planten geselecteerd)'}\n\nGraag een offerte met mijn B2B-prijzen.\n\nBedrijf:\nNaam:\nTelefoon:\n`
    goTop(`mailto:jelle@sterapro.be?subject=${encodeURIComponent('Offerteaanvraag via plantconfigurator')}&body=${encodeURIComponent(body)}`)
  }

  const navBtn = (label: string, dir: 1 | -1, disabled = false) => (
    <span onClick={() => !disabled && setStep(step + dir)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1, fontFamily: C.sans, fontWeight: 600, fontSize: 15,
      ...(dir > 0
        ? { background: C.deep, color: C.creme, padding: '14px 28px', borderRadius: 999 }
        : { color: C.deep, padding: '14px 10px' }),
    }}>
      {dir < 0 && <IcoArrow size={16} style={{ transform: 'rotate(180deg)' }} />}{label}{dir > 0 && <IcoArrow size={16} />}
    </span>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.creme }}>
      <header style={{ borderBottom: `1px solid ${C.line}`, background: C.creme, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sterapro-logo.png" alt="Stera Pro" style={{ height: 36, width: 'auto', display: 'block' }} />
          <Stepper step={step} />
          <span onClick={reset} style={{ fontFamily: C.sans, fontSize: 13.5, color: C.mut, cursor: 'pointer', whiteSpace: 'nowrap' }}>Opnieuw beginnen</span>
        </div>
      </header>

      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '52px 32px 80px' }}>
        {/* STAP 1 */}
        {step === 0 && (
          <div>
            <SectionHead kicker="Stap 1 · Jouw ruimte" title="Vertel ons over de plek"
              sub="Vier korte vragen — daarmee weten we welke planten er écht zullen gedijen." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40, marginTop: 44 }}>
              {CFG_Q.map((q) => (
                <div key={q.key}>
                  <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 18, color: C.deep }}>{q.title}</div>
                  <div style={{ fontFamily: C.sans, fontSize: 14, color: C.mut, marginTop: 4 }}>{q.sub}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                    {q.opts.map((o) => (
                      <Option key={String(o.v)} active={ans[q.key] === o.v} title={o.t} desc={o.d} badge={o.badge}
                        onClick={() => setAns({ ...ans, [q.key]: o.v })} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 48 }}>
              {navBtn('Toon geschikte planten', 1, !answered)}
            </div>
          </div>
        )}

        {/* STAP 2 */}
        {step === 1 && (
          <div>
            <SectionHead kicker="Stap 2 · Planten" title={`${matches.length} planten passen bij jouw ruimte`}
              sub="Selecteer de planten die je aanspreken — meerdere mag. In het voorstel bepalen we samen de aantallen." />
            {matches.length === 0 ? (
              <div style={{ marginTop: 44, background: C.sand, borderRadius: 16, padding: '36px 40px', maxWidth: 640 }}>
                <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 18, color: C.deep }}>Een uitdagende combinatie — net iets voor ons.</div>
                <p style={{ margin: '10px 0 0', fontFamily: C.sans, fontSize: 14.5, lineHeight: 1.6, color: C.mut }}>
                  Voor deze ruimte bekijken we de opties beter ter plaatse, met een licht- en vochtmeting.
                </p>
                <div style={{ marginTop: 20 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: C.deep, color: C.creme, fontFamily: C.sans, fontWeight: 600, fontSize: 14, padding: '11px 22px', borderRadius: 999, cursor: 'pointer' }}>
                    <IcoCal size={16} /> Plan een adviesbezoek
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 44 }}>
                {matches.map(({ p, perfect }) => (
                  <PlantCard key={p.id} p={p} perfect={perfect} selected={picked.includes(p.id)}
                    onToggle={() => setPicked(picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id])} />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
              {navBtn('Vorige', -1)}
              {navBtn(picked.length ? `Kies potten voor ${picked.length} plant${picked.length > 1 ? 'en' : ''}` : 'Selecteer eerst een plant', 1, !picked.length)}
            </div>
          </div>
        )}

        {/* STAP 3 */}
        {step === 2 && (
          <div>
            <SectionHead kicker="Stap 3 · Potten" title="Kies een lijn en kleur"
              sub="Wij stemmen de maat per plant af — elke pot krijgt automatisch de juiste diameter en een waterreservoir." />
            <div style={{ display: 'flex', gap: 20, marginTop: 44, flexWrap: 'wrap' }}>
              {CFG_POTS.map((p) => (
                <PotCard key={p.id} pot={p} selColor={pot && pot.lijn === p.id ? pot.kleur : null}
                  onPick={(kleur) => setPot({ lijn: p.id, kleur })} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 28, fontFamily: C.sans, fontSize: 13.5, color: C.mut }}>
              <IcoCheck size={15} style={{ color: C.green }} /> Twijfel je over de kleur? In het voorstel tonen we de combinatie op foto&apos;s van jouw ruimte.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
              {navBtn('Vorige', -1)}
              {navBtn('Naar het overzicht', 1, !pot)}
            </div>
          </div>
        )}

        {/* STAP 4 */}
        {step === 3 && (
          <div>
            <SectionHead kicker="Stap 4 · Overzicht" title="Jouw groene voorstel"
              sub="Zet de planten meteen in je winkelmandje, of vraag een offerte aan met jouw B2B-prijzen." />
            <div style={{ display: 'flex', gap: 48, marginTop: 44, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {selPlants.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 18, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.img} alt={p.name} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 15.5, color: C.ink }}>{p.name} <span style={{ fontWeight: 400, fontStyle: 'italic', color: C.mut, fontSize: 13 }}>{p.latin}</span></div>
                      <div style={{ fontFamily: C.sans, fontSize: 13, color: C.mut, marginTop: 4 }}>
                        ↕ {p.h} cm{potLine ? ` · in ${potLine.name.toLowerCase()} '${pot!.kleur}' Ø ${p.pot + 6} cm` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.green, fontFamily: C.sans, fontWeight: 600, fontSize: 13 }}>
                      <IcoLock size={14} /> Jouw prijs na login
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ flex: '0 0 380px', minWidth: 300, background: C.deep, borderRadius: 18, padding: '32px 34px' }}>
                <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 26, color: C.creme }}>Klaar om te groeien?</div>
                <p style={{ margin: '12px 0 0', fontFamily: C.sans, fontSize: 14, lineHeight: 1.6, color: C.mutLight }}>
                  Zet je selectie in het winkelmandje en reken af met jouw prijzen, of vraag eerst een offerte met levertermijn en onderhoudsvoorstel.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
                  <span onClick={addToCart} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: adding ? 'default' : 'pointer',
                    opacity: adding ? 0.6 : 1, background: C.creme, color: C.deep, fontFamily: C.sans, fontWeight: 600, fontSize: 15, padding: '14px 24px', borderRadius: 999,
                  }}>
                    <IcoCart size={17} /> {adding ? 'Bezig…' : 'In winkelmandje'}
                  </span>
                  <span onClick={requestQuote} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer',
                    color: C.creme, border: '1.5px solid rgba(255,253,247,.55)', fontFamily: C.sans, fontWeight: 600, fontSize: 14, padding: '12px 22px', borderRadius: 999,
                  }}>
                    Vraag offerte aan <IcoArrow size={15} />
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontFamily: C.sans, fontSize: 12.5, color: 'rgba(255,253,247,.6)' }}>
                  <IcoCheck size={14} /> Adviesbezoek wordt verrekend bij bestelling.
                </div>
              </div>
            </div>
            <div style={{ marginTop: 40 }}>{navBtn('Vorige', -1)}</div>
          </div>
        )}
      </main>
    </div>
  )
}
