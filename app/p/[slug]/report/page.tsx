import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { demoEnabled } from '@/lib/demo-session'
import { demoPublicPlant } from '@/lib/portal-demo-data'
import { hasDemoPortalSession } from '@/lib/portal-demo'
import { mspHref, mspStore, SHOP_LOGO_URL } from '@/lib/msp-request'
import PlantReportForm from './form'

type PublicPlantLite = {
  id: string
  nickname: string | null
  species: string | null
  reference_code: string | null
  place?: string | null
}

function plantTitle(plant: PublicPlantLite | null): string {
  if (!plant) return 'Plant'
  return plant.nickname || plant.species || plant.reference_code || 'Plant'
}

async function lookupPlant(slug: string): Promise<PublicPlantLite | null> {
  const demo = demoEnabled() ? demoPublicPlant(slug) : null
  if (demo) return demo
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_public_plant', { _slug: slug })
    if (error || !data) return null
    return data as PublicPlantLite
  } catch {
    return null
  }
}

async function knownCustomer(voorbeeld: boolean): Promise<boolean> {
  if (mspStore().demo || voorbeeld) return true
  if (await hasDemoPortalSession()) return true
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    return Boolean(data.user)
  } catch {
    return false
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const plant = await lookupPlant(slug)
  return { title: `Melding · ${plantTitle(plant)}`, description: 'Meld een probleem met deze plant.' }
}

export default async function PlantReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ voorbeeld?: string; fout?: string; sent?: string }>
}) {
  const { slug } = await params
  const query = searchParams ? await searchParams : {}
  const plant = await lookupPlant(slug)
  const known = await knownCustomer(query.voorbeeld === '1' && demoEnabled() && !!demoPublicPlant(slug))
  const liquid = mspStore().liquid

  return (
    <div className="msp-root">
      <div className="msp-qr">
        {liquid ? null : (
          <p className="msp-logo-row">
            <a href="https://sterapro.be">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SHOP_LOGO_URL} alt="SteraPro" className="msp-logo" />
            </a>
          </p>
        )}
        <p>
          <a className="msp-link" href={mspHref(`/p/${slug}`)}>
            Terug
          </a>
        </p>
        <h1 className="msp-title">Probleem melden</h1>
        {query.sent === '1' ? (
          <p className="msp-banner">Bedankt. We hebben je melding.</p>
        ) : plant ? (
          <PlantReportForm
            slug={slug}
            known={known}
            title={plantTitle(plant)}
            place={plant.place}
            error={query.fout}
          />
        ) : (
          <p className="msp-lead">Deze plant is niet meer gekoppeld. Scan de QR opnieuw.</p>
        )}
      </div>
    </div>
  )
}
