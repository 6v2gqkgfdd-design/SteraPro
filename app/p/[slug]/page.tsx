import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { demoEnabled } from '@/lib/demo-session'
import { demoPublicPlant, demoPlantBySlug } from '@/lib/portal-demo-data'
import { hasDemoPortalSession } from '@/lib/portal-demo'
import { mspHref, mspStore, SHOP_LOGO_URL } from '@/lib/msp-request'

type LatestVisit = {
  performed_at: string | null
  action_watered: boolean | null
  action_pruned: boolean | null
  action_fed: boolean | null
  action_cleaned: boolean | null
  action_rotated: boolean | null
  action_repotted: boolean | null
  action_replaced: boolean | null
}

type PublicPlant = {
  id: string
  qr_slug: string | null
  nickname: string | null
  plant_code: string | null
  reference_code: string | null
  species: string | null
  status: string | null
  photo_url: string | null
  care_tips: string | null
  is_dead: boolean | null
  is_dying: boolean | null
  needs_replacement: boolean | null
  place?: string | null
  latest_visit: LatestVisit | null
  maintenance_photo_url: string | null
}

const ACTION_LABELS: Record<string, string> = {
  action_watered: 'water',
  action_fed: 'voeding',
  action_pruned: 'gesnoeid',
  action_rotated: 'gedraaid',
  action_cleaned: 'bladeren gereinigd',
  action_repotted: 'verpot',
  action_replaced: 'vervangen',
}

function plantTitle(plant: PublicPlant): string {
  return plant.nickname || plant.species || plant.reference_code || plant.plant_code || 'Plant'
}

function publicStatus(plant: PublicPlant): { tag: 'ok' | 'let' | 'alarm' | 'neutraal'; text: string; line: string } {
  if (plant.is_dead || plant.status === 'dead' || plant.status === 'removed') {
    return { tag: 'neutraal', text: 'Verwijderd', line: 'Deze plant staat niet meer op de plek.' }
  }
  if (plant.needs_replacement || plant.status === 'replacement_needed') {
    return { tag: 'alarm', text: 'Vervangen nodig', line: 'We vervangen deze plant.' }
  }
  if (plant.is_dying || plant.status === 'needs_attention' || plant.status === 'maintenance_due') {
    return { tag: 'let', text: 'Opvolgen', line: 'We volgen deze plant op.' }
  }
  return { tag: 'ok', text: 'Gezond', line: 'Gezond.' }
}

async function getPublicPlant(slug: string): Promise<PublicPlant | null> {
  const demo = demoEnabled() ? demoPublicPlant(slug) : null
  if (demo) return demo

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_public_plant', { _slug: slug })
    if (error || !data) return null
    return data as PublicPlant
  } catch {
    return null
  }
}

function visitActions(visit: LatestVisit | null): string[] {
  if (!visit) return []
  return Object.entries(ACTION_LABELS)
    .filter(([key]) => Boolean((visit as Record<string, unknown>)[key]))
    .map(([, label]) => label)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const plant = await getPublicPlant(slug)
  if (!plant) return { title: 'Plant', description: 'Plantinformatie via SteraPro.' }
  return { title: plantTitle(plant), description: 'Plantinformatie via SteraPro.' }
}

function Frame({ children }: { children: React.ReactNode }) {
  const liquid = mspStore().liquid
  return (
    <div className="msp-root">
      {liquid ? null : (
        <p className="msp-logo-row">
          <a href="https://sterapro.be">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SHOP_LOGO_URL} alt="SteraPro" className="msp-logo" />
          </a>
        </p>
      )}
      {children}
      {liquid ? null : (
        <p className="msp-foot">
          Deze plant wordt opgevolgd door SteraPro · <a href="https://sterapro.be">Meer over SteraPro</a>
        </p>
      )}
    </div>
  )
}

function Leaf() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 22V10" />
      <path d="M12 10C12 6 9 4 6 4c0 4 3 6 6 6z" />
      <path d="M12 14c0-3 3-5 6-5 0 4-3 6-6 6z" />
    </svg>
  )
}

export default async function PublicPlantPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ voorbeeld?: string }>
}) {
  const { slug } = await params
  const query = searchParams ? await searchParams : {}
  const plant = await getPublicPlant(slug)
  const demoPlant = demoEnabled() ? demoPlantBySlug(slug) : null
  const voorbeeld = query.voorbeeld === '1' && !!demoPlant
  const session = demoPlant ? await hasDemoPortalSession() : false
  const showMore = !!demoPlant && (mspStore().demo || voorbeeld || session)

  if (!plant) {
    return (
      <Frame>
        <div className="msp-qr">
          <h1 className="msp-title">Deze code kennen we niet</h1>
          <p className="msp-lead">
            Er hoort geen plant bij deze QR. De plant is mogelijk weggehaald, of de code is nog niet gekoppeld.
          </p>
          <p style={{ marginTop: 20 }}>
            <a className="msp-btn" href="https://sterapro.be">
              Naar sterapro.be
            </a>
          </p>
        </div>
      </Frame>
    )
  }

  const status = publicStatus(plant)
  const title = plantTitle(plant)
  const latin = plant.species && plant.species !== title ? plant.species : null
  const photo = plant.maintenance_photo_url || plant.photo_url
  const lastDate = plant.latest_visit?.performed_at
    ? new Date(plant.latest_visit.performed_at).toLocaleDateString('nl-BE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null
  const actions = visitActions(plant.latest_visit)
  const reportHref = `${mspHref(`/p/${slug}/report`)}${showMore ? '?voorbeeld=1' : ''}`
  const portalHref = mspStore().base.startsWith('/apps/')
    ? `/apps/mijn/voorbeeld/planten/${plant.id}`
    : `/portal/planten/${plant.id}`

  return (
    <Frame>
      <div className="msp-qr">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="msp-ph" style={{ borderRadius: 14, marginBottom: 16 }} />
        ) : (
          <span className="msp-ph msp-ph-sm" style={{ borderRadius: 14, marginBottom: 16 }}>
            <Leaf />
          </span>
        )}
        {plant.place ? <p className="msp-kicker">{plant.place}</p> : null}
        <h1 className="msp-title">{title}</h1>
        {latin ? <p className="msp-latin">{latin}</p> : null}
        <p style={{ margin: '12px 0' }}>
          <span className={`msp-badge msp-badge-${status.tag}`}>{status.text}</span>
        </p>
        <p className="msp-lead">{status.line}</p>
        <div className="msp-qr-report">
          <a className="msp-btn" href={reportHref}>
            Probleem melden
          </a>
        </div>
        <section className="msp-panel" style={{ marginTop: 20 }}>
          <h2>Laatste onderhoud</h2>
          <p>
            {lastDate ? lastDate : 'Nog geen onderhoud geregistreerd.'}
            {actions.length > 0 ? ` · ${actions.join(' · ')}` : ''}
          </p>
        </section>
        {plant.care_tips?.trim() ? (
          <section className="msp-panel">
            <h2>Verzorging</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{plant.care_tips}</p>
          </section>
        ) : null}
        {showMore && demoPlant ? (
          <section className="msp-panel">
            <h2>Voor jou</h2>
            <p>
              {[demoPlant.room_name, demoPlant.room_floor].filter(Boolean).join(' · ')}
            </p>
            {demoPlant.customer_note ? <p>{demoPlant.customer_note}</p> : null}
            <p>
              <a className="msp-link" href={portalHref}>
                Open in Mijn SteraPro
              </a>
              {' · '}
              <a className="msp-link" href={mspHref(`/p/${slug}/label`)}>
                QR-label
              </a>
            </p>
          </section>
        ) : null}
      </div>
    </Frame>
  )
}
