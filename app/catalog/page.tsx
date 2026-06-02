/**
 * Stera Pro — Catalogus (server)
 *
 * Haalt de combinaties/moswanden één keer op (via lib/catalog-items) en
 * geeft ze door aan CatalogClient — die filtert/pagineert in de browser.
 *
 * BELANGRIJK: inkoopprijs/marge worden hier NIET opgehaald — klant-zichtbaar.
 */

import { createClient } from '@supabase/supabase-js'
import ScrollRestorer from './ScrollRestorer'
import CatalogClient, { type CatalogInitial } from './CatalogClient'
import { loadCatalogItems } from '@/lib/catalog-items'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

function parseArray(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const items = await loadCatalogItems(supabase)

  const initial: CatalogInitial = {
    tab: params.tab === 'moswanden' ? 'moswanden' : 'combinaties',
    q: typeof params.q === 'string' ? params.q : '',
    inStock: params.inStock === '0' ? false : true,
    height: typeof params.height === 'string' ? params.height : '',
    diameter: typeof params.diameter === 'string' ? params.diameter : '',
    substraten: parseArray(params.substraat),
    locaties: parseArray(params.locatie),
    lichten: parseArray(params.licht),
    systems: parseArray(params.system),
    shapes: parseArray(params.shape),
    plantsoorten: parseArray(params.plantsoort),
    merken: parseArray(params.merk),
    frames: parseArray(params.frame),
    mostypes: parseArray(params.mostype),
    moskleuren: parseArray(params.moskleur),
  }

  return (
    <>
      <ScrollRestorer />
      <CatalogClient items={items} initial={initial} />
    </>
  )
}
