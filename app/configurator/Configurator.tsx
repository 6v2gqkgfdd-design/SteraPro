'use client'

import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react'
import { CFG_Q, CFG_STEPS, type CfgPlant } from './data'

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
const IcoCart = (p: IcoProps) => <Ico {...p} d={<g><path d="M3 4h2l2.4 12.2A2 2 0 0 0 9.36 18h8.1a2 2 0 0 0 1.95-1.57L21 9H6" /><circle cx="9.5" cy="21" r="1" /><circle cx="17.5" cy="21" r="1" /></g>} />

const shortSize = (s: string) => s.replace(/\s*\(.*\)\s*/, '').trim()
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase()

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

/* ── Plantbeeld (echte foto of nette placeholder) ──────── */
function PlantImage({ p, h, radius = 0 }: { p: CfgPlant; h: number; radius?: number }) {
  const base: CSSProperties = { width: '100%', height: h, borderRadius: radius, display: 'block' }
  if (p.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.image} alt={p.plant} style={{ ...base, objectFit: 'cover' }} />
  }
  return (
    <div style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E7ECE3' }}>
      <span style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: h < 90 ? 18 : 32, color: C.green }}>{initials(p.plant)}</span>
    </div>
  )
}

/* ── Stap-onderdelen ───────────────────────────────────── */
function Option({ active, title, desc, onClick }: { active: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      flex: 1, minWidth: 200, cursor: 'pointer', background: active ? C.deep : '#fff',
      border: `1.5px solid ${active ? C.deep : C.line}`, borderRadius: 14, padding: '20px 22px', transition: 'all .15s ease',
    }}>
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
  const meta = [p.light.join(' / ') || null, p.sizes.map(shortSize).join('/') || null, `${p.pots.length} pot${p.pots.length > 1 ? 'ten' : ''}`].filter(Boolean).join(' · ')
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
      <PlantImage p={p} h={190} />
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 15, color: C.ink, lineHeight: 1.25 }}>{p.plant}</div>
        <div style={{ fontFamily: C.sans, fontSize: 12.5, color: C.mut, marginTop: 8 }}>{meta}</div>
      </div>
    </div>
  )
}

/* ── Hoofdcomponent ────────────────────────────────────── */
const CFG_LS = 'stera-configurator-v2'
type SavedState = { step?: number; ans?: Record<string, string>; picked?: string[]; potByPlant?: Record<string, string> }
function loadState(): SavedState {
  if (typeof window === 'undefined') return {}
  try { return (JSON.parse(localStorage.getItem(CFG_LS) || '{}') as SavedState) || {} } catch { return {} }
}

export default function Configurator() {
  const [catalog, setCatalog] = useState<CfgPlant[]>([])
  const [shop, setShop] = useState('sterapro.be')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [step, setStep] = useState<number>(() => loadState().step ?? 0)
  const [ans, setAns] = useState<Record<string, string>>(() => loadState().ans ?? {})
  const [picked, setPicked] = useState<string[]>(() => loadState().picked ?? [])
  const [potByPlant, setPotByPlant] = useState<Record<string, string>>(() => loadState().potByPlant ?? {})

  // Live assortiment laden.
  useEffect(() => {
    let alive = true
    fetch('/api/configurator/catalog')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        setCatalog(Array.isArray(d?.plants) ? d.plants : [])
        if (d?.shop) setShop(String(d.shop))
        setLoading(false)
      })
      .catch(() => { if (alive) { setError('Kon het assortiment niet laden.'); setLoading(false) } })
    return () => { alive = false }
  }, [])

  // Bewaren (zonder de catalogus).
  useEffect(() => {
    localStorage.setItem(CFG_LS, JSON.stringify({ step, ans, picked, potByPlant }))
  }, [step, ans, picked, potByPlant])

  // Hoogte naar de Shopify-pagina sturen zodat de iframe meegroeit.
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return
    const post = () => window.parent.postMessage({ type: 'stera-cfg-height', height: document.documentElement.scrollHeight }, '*')
    post()
    const ro = new ResizeObserver(post)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [step, catalog, picked])

  const answered = CFG_Q.every((q) => ans[q.key] !== undefined)

  const matches = useMemo(() => {
    if (!answered) return [] as { p: CfgPlant; perfect: boolean }[]
    const baseOk = (p: CfgPlant) => {
      const lightOk = ans.light === 'any' || p.light.length === 0 || p.light.includes(ans.light)
      const plekOk = ans.plek !== 'buiten' || p.outdoor
      return lightOk && plekOk
    }
    const sizeOk = (p: CfgPlant) => ans.size === 'any' || p.sizes.includes(ans.size)
    const shown = catalog.filter(baseOk)
    const perfect = shown.filter(sizeOk)
    const near = shown.filter((p) => !sizeOk(p))
    return [...perfect.map((p) => ({ p, perfect: true })), ...near.map((p) => ({ p, perfect: false }))]
  }, [catalog, ans, answered])

  const selPlants = picked.map((n) => catalog.find((p) => p.plant === n)).filter((p): p is CfgPlant => Boolean(p))
  // Gekozen pot, of standaard = eerste beschikbare pot. Afgeleid tijdens render.
  const potVariant = (pl: CfgPlant) => potByPlant[pl.plant] || pl.pots[0]?.variantId || ''

  const reset = () => { setStep(0); setAns({}); setPicked([]); setPotByPlant({}) }

  const goTop = (url: string) => {
    try { (window.top ?? window).location.assign(url) } catch { window.location.assign(url) }
  }

  function addToCart() {
    const pairs = selPlants.map((pl) => potVariant(pl)).filter(Boolean).map((v) => `${v}:1`)
    if (!pairs.length) { alert('Kies eerst minstens één plant en pot.'); return }
    goTop(`https://${shop}/cart/${pairs.join(',')}`)
  }

  const navBtn = (label: string, dir: 1 | -1, disabled = false) => (
    <span onClick={() => !disabled && setStep(step + dir)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1, fontFamily: C.sans, fontWeight: 600, fontSize: 15,
      ...(dir > 0 ? { background: C.deep, color: C.creme, padding: '14px 28px', borderRadius: 999 } : { color: C.deep, padding: '14px 10px' }),
    }}>{dir < 0 && <IcoArrow size={16} style={{ transform: 'rotate(180deg)' }} />}{label}{dir > 0 && <IcoArrow size={16} />}</span>
  )

  const notice = (txt: string) => (
    <div style={{ marginTop: 44, background: C.sand, borderRadius: 16, padding: '28px 32px', maxWidth: 640, fontFamily: C.sans, fontSize: 15, color: C.deep }}>{txt}</div>
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
        {/* STAP 1 — Jouw ruimte */}
        {step === 0 && (
          <div>
            <SectionHead kicker="Stap 1 · Jouw ruimte" title="Vertel ons over de plek"
              sub="Een paar korte vragen — daarmee filteren we jouw assortiment tot wat hier écht zal gedijen." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40, marginTop: 44 }}>
              {CFG_Q.map((q) => (
                <div key={q.key}>
                  <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 18, color: C.deep }}>{q.title}</div>
                  <div style={{ fontFamily: C.sans, fontSize: 14, color: C.mut, marginTop: 4 }}>{q.sub}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                    {q.opts.map((o) => (
                      <Option key={o.v} active={ans[q.key] === o.v} title={o.t} desc={o.d}
                        onClick={() => setAns({ ...ans, [q.key]: o.v })} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 48 }}>
              {navBtn(loading ? 'Assortiment laden…' : 'Toon geschikte planten', 1, !answered || loading)}
            </div>
          </div>
        )}

        {/* STAP 2 — Planten */}
        {step === 1 && (
          <div>
            <SectionHead kicker="Stap 2 · Planten" title={`${matches.length} planten passen bij jouw ruimte`}
              sub="Selecteer de planten die je aanspreken — meerdere mag. In de volgende stap kies je per plant een pot." />
            {error ? notice(error)
              : matches.length === 0 ? notice('We vonden geen directe match. Pas je antwoorden iets aan — met een andere licht- of groottekeuze vinden we vast passende planten.')
                : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 44 }}>
                    {matches.map(({ p, perfect }) => (
                      <PlantCard key={p.plant} p={p} perfect={perfect} selected={picked.includes(p.plant)}
                        onToggle={() => setPicked(picked.includes(p.plant) ? picked.filter((x) => x !== p.plant) : [...picked, p.plant])} />
                    ))}
                  </div>
                )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
              {navBtn('Vorige', -1)}
              {navBtn(picked.length ? `Kies potten voor ${picked.length} plant${picked.length > 1 ? 'en' : ''}` : 'Selecteer eerst een plant', 1, !picked.length)}
            </div>
          </div>
        )}

        {/* STAP 3 — Potten (echte potten per plant) */}
        {step === 2 && (
          <div>
            <SectionHead kicker="Stap 3 · Potten" title="Kies een pot per plant"
              sub="Voor elke plant tonen we de potten waarin we ze leveren — kies je favoriet." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 40 }}>
              {selPlants.map((pl) => (
                <div key={pl.plant} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}><PlantImage p={pl} h={48} radius={10} /></span>
                    <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 16, color: C.ink }}>{pl.plant}</div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                    {pl.pots.map((pot) => {
                      const on = potVariant(pl) === pot.variantId
                      return (
                        <span key={pot.variantId} onClick={() => setPotByPlant({ ...potByPlant, [pl.plant]: pot.variantId })} style={{
                          cursor: 'pointer', fontFamily: C.sans, fontSize: 13.5, fontWeight: on ? 600 : 500, padding: '8px 14px', borderRadius: 999,
                          border: `1.5px solid ${on ? C.green : C.line}`, background: on ? 'rgba(66,111,82,.08)' : '#fff', color: on ? C.deep : C.mut,
                        }}>{pot.pot}</span>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
              {navBtn('Vorige', -1)}
              {navBtn('Naar het overzicht', 1, !selPlants.length)}
            </div>
          </div>
        )}

        {/* STAP 4 — Overzicht */}
        {step === 3 && (
          <div>
            <SectionHead kicker="Stap 4 · Overzicht" title="Jouw groene selectie"
              sub="Zet je samengestelde planten in één klik in het winkelmandje, met jouw B2B-prijzen." />
            <div style={{ display: 'flex', gap: 48, marginTop: 44, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {selPlants.map((pl) => {
                  const pot = pl.pots.find((x) => x.variantId === potVariant(pl)) || pl.pots[0]
                  return (
                    <div key={pl.plant} style={{ display: 'flex', alignItems: 'center', gap: 18, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
                      <span style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}><PlantImage p={pl} h={72} radius={10} /></span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: C.sans, fontWeight: 600, fontSize: 15.5, color: C.ink }}>{pl.plant}</div>
                        <div style={{ fontFamily: C.sans, fontSize: 13, color: C.mut, marginTop: 4 }}>in {pot?.pot || 'pot'}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.green, fontFamily: C.sans, fontWeight: 600, fontSize: 13 }}>
                        <IcoLock size={14} /> Jouw prijs na login
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ flex: '0 0 380px', minWidth: 300, background: C.deep, borderRadius: 18, padding: '32px 34px' }}>
                <div style={{ fontFamily: C.serif, fontStyle: 'italic', fontSize: 26, color: C.creme }}>Klaar om te groeien?</div>
                <p style={{ margin: '12px 0 0', fontFamily: C.sans, fontSize: 14, lineHeight: 1.6, color: C.mutLight }}>
                  Zet je selectie in het winkelmandje en reken meteen af met jouw B2B-prijzen.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
                  <span onClick={addToCart} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer',
                    background: C.creme, color: C.deep, fontFamily: C.sans, fontWeight: 600, fontSize: 15, padding: '14px 24px', borderRadius: 999,
                  }}><IcoCart size={17} /> In winkelmandje</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontFamily: C.sans, fontSize: 12.5, color: 'rgba(255,253,247,.6)' }}>
                  <IcoLock size={14} /> Jouw B2B-prijzen verschijnen in het mandje na inloggen.
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
