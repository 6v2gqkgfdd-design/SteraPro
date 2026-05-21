// Lichte foto-proxy voor werkbon-foto's.
//
// Probleem: als de browser een werkbon naar PDF afdrukt, propt hij de
// plantfoto's op volle resolutie (of als WebP die hij opnieuw inpakt)
// in het bestand — wat enorme PDF's oplevert.
//
// Oplossing: deze route haalt de foto via de ingebouwde Next.js
// image-optimizer op, sterk verkleind én als JPEG (door 'Accept' op
// image/jpeg te zetten, kiest de optimizer geen WebP). Het resultaat
// is een compacte foto die de browser efficiënt in de PDF kan zetten.

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const src = searchParams.get('u')

  if (!src || !/^https?:\/\//i.test(src)) {
    return new Response('Ongeldige afbeelding', { status: 400 })
  }

  const host = request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  if (!host) {
    return new Response('Onbekende host', { status: 500 })
  }

  // Via de optimizer: w=256 (ruim voldoende voor de kleine miniaturen
  // op de werkbon) en q=75 (de standaardkwaliteit die zeker toegelaten
  // is). De optimizer beperkt zelf welke bronhosts mogen — zie
  // images.remotePatterns in next.config.ts.
  const optimizerUrl =
    `${proto}://${host}/_next/image` +
    `?url=${encodeURIComponent(src)}&w=256&q=75`

  let upstream: Response
  try {
    upstream = await fetch(optimizerUrl, { headers: { accept: 'image/jpeg' } })
  } catch {
    return new Response('Afbeelding niet bereikbaar', { status: 502 })
  }

  if (!upstream.ok) {
    return new Response('Afbeelding niet beschikbaar', {
      status: upstream.status,
    })
  }

  const body = await upstream.arrayBuffer()
  return new Response(body, {
    headers: {
      'content-type': upstream.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
