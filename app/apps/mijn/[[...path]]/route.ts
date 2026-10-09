import { createElement, type ReactNode } from 'react'
import { prerender } from 'react-dom/static'
import { demoEnabled } from '@/lib/demo-session'
import { labelDocument } from '@/lib/plant-label'
import { mspAls, type MspStore } from '@/lib/msp-request'
import { mspResponse } from '@/lib/msp-document'
import { verifyProxySignature } from '@/lib/shopify-proxy'
import { postAanvraag, postMelding, postNotitie } from '@/lib/portal-post'
import { MspGate, MspWaiting } from '@/components/msp-gate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type PageQuery = {
  voorbeeld?: string
  fout?: string
  sent?: string
  notitie?: string
  aanvraag?: string
}

async function markup(node: ReactNode): Promise<string> {
  const { prelude } = await prerender(node)
  const reader = prelude.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function renderPage(loader: () => Promise<ReactNode>, store: MspStore): Promise<string> {
  return mspAls.run(store, async () => markup(await loader()))
}

function notFoundFragment() {
  return `<div class="msp-root"><h1 class="msp-title">Deze pagina kennen we niet</h1><p class="msp-lead"><a class="msp-link" href="/apps/mijn">Terug</a></p></div>`
}

function pageQuery(url: URL): PageQuery {
  return {
    voorbeeld: url.searchParams.get('voorbeeld') || undefined,
    fout: url.searchParams.get('fout') || undefined,
    sent: url.searchParams.get('sent') || undefined,
    notitie: url.searchParams.get('notitie') || undefined,
    aanvraag: url.searchParams.get('aanvraag') || undefined,
  }
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const segments = url.pathname.replace(/^\/apps\/mijn\/?/, '').split('/').filter(Boolean)
  const signed = url.searchParams.has('signature')
  if (signed && !verifyProxySignature(url.searchParams)) {
    return new Response('Ongeldige handtekening.', { status: 401 })
  }
  const demoOn = demoEnabled()
  if (!signed && !demoOn) {
    return new Response('Deze ingang verwacht de shop.', { status: 401 })
  }
  const liquid = signed || url.searchParams.get('liquid') === '1'

  if (req.method === 'POST' && segments[0] === 'api') {
    const form = await req.formData()
    if (segments[1] === 'melding') return postMelding(form)
    if (segments[1] === 'notitie') return postNotitie(form)
    if (segments[1] === 'aanvraag') return postAanvraag(form)
    return mspResponse(notFoundFragment(), liquid, 404)
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Methode niet ondersteund.', { status: 405 })
  }

  if (segments[0] === 'p' && segments[1] && segments[2] === 'label') {
    const html = await labelDocument(segments[1], `/apps/mijn/p/${segments[1]}`)
    if (!html) return mspResponse(notFoundFragment(), liquid, 404)
    const body = liquid ? `{% layout none %}\n${html}` : html
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': liquid ? 'application/liquid; charset=utf-8' : 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }

  try {
    const html = await renderSegment(segments, {
      liquid,
      demoOn,
      customer: (url.searchParams.get('logged_in_customer_id') || '').trim(),
      query: pageQuery(url),
    })
    return mspResponse(html, liquid)
  } catch (error) {
    const digest = error && typeof error === 'object' && 'digest' in error ? String(error.digest) : ''
    if (digest.includes('404')) return mspResponse(notFoundFragment(), liquid, 404)
    console.error('[apps/mijn]', error instanceof Error ? error.message : 'render')
    return mspResponse(
      `<div class="msp-root"><h1 class="msp-title">Even niet beschikbaar</h1><p class="msp-lead">Ververs de pagina.</p></div>`,
      liquid,
      500
    )
  }
}

async function renderSegment(segments: string[], ctx: {
  liquid: boolean
  demoOn: boolean
  customer: string
  query: PageQuery
}): Promise<string> {
  const { liquid, demoOn, customer, query } = ctx
  const searchParams = Promise.resolve(query)

  if (segments.length === 0 || segments[0] === 'login') {
    if (customer) return markup(createElement(MspWaiting, { demo: demoOn }))
    return markup(createElement(MspGate, { demo: demoOn }))
  }

  if (segments[0] === 'p' && segments[1] && !segments[2]) {
    const mod = await import('@/app/p/[slug]/page')
    return renderPage(
      () => mod.default({ params: Promise.resolve({ slug: segments[1] }), searchParams }),
      { base: '/apps/mijn', demo: false, liquid }
    )
  }

  if (segments[0] === 'p' && segments[1] && segments[2] === 'report') {
    const mod = await import('@/app/p/[slug]/report/page')
    return renderPage(
      () => mod.default({ params: Promise.resolve({ slug: segments[1] }), searchParams }),
      { base: '/apps/mijn', demo: false, liquid }
    )
  }

  if (segments[0] === 'voorbeeld' && demoOn) {
    const rest = segments.slice(1)
    const store: MspStore = { base: '/apps/mijn/voorbeeld', demo: true, liquid }
    if (rest.length === 0 || rest[0] === 'dashboard') {
      const mod = await import('@/app/portal/dashboard/page')
      return renderPage(() => mod.default(), store)
    }
    if (rest[0] === 'onderhoud' && rest[1]) {
      const mod = await import('@/app/portal/onderhoud/[id]/page')
      return renderPage(() => mod.default({ params: Promise.resolve({ id: rest[1] }) }), store)
    }
    if (rest[0] === 'onderhoud') {
      const mod = await import('@/app/portal/onderhoud/page')
      return renderPage(() => mod.default(), store)
    }
    if (rest[0] === 'planten' && rest[1]) {
      const mod = await import('@/app/portal/planten/[id]/page')
      return renderPage(() => mod.default({ params: Promise.resolve({ id: rest[1] }), searchParams }), store)
    }
    if (rest[0] === 'planten') {
      const mod = await import('@/app/portal/planten/page')
      return renderPage(() => mod.default(), store)
    }
    if (rest[0] === 'leveringen') {
      const mod = await import('@/app/portal/leveringen/page')
      return renderPage(() => mod.default(), store)
    }
    if (rest[0] === 'contract') {
      const mod = await import('@/app/portal/contract/page')
      return renderPage(() => mod.default(), store)
    }
    if (rest[0] === 'aanvraag') {
      const mod = await import('@/app/portal/aanvraag/page')
      return renderPage(() => mod.default({ searchParams }), store)
    }
    if (rest[0] === 'offertes') {
      const mod = await import('@/app/portal/offertes/page')
      return renderPage(() => mod.default(), store)
    }
    if (rest[0] === 'bestellingen') {
      const mod = await import('@/app/portal/bestellingen/page')
      return renderPage(() => mod.default(), store)
    }
    if (rest[0] === 'facturen') {
      const mod = await import('@/app/portal/facturen/page')
      return renderPage(() => mod.default(), store)
    }
  }

  if (segments[0] === 'voorbeeld') return markup(createElement(MspGate, { demo: false }))
  return notFoundFragment()
}
