import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let cssCache: string | null = null

export function mspCss(): string {
  if (!cssCache) cssCache = readFileSync(join(process.cwd(), 'app/msp.css'), 'utf8')
  return cssCache
}

export function safeBack(value: FormDataEntryValue | null, fallback: string): string {
  const raw = String(value || '')
  const [path, query] = raw.split('?')
  if (!/^\/(p|portal|apps\/mijn)(\/|[?#]|$)/.test(path)) return fallback
  if (path.includes('//') || path.includes('\\') || path.includes('..')) return fallback
  const keep = new URLSearchParams()
  if (new URLSearchParams(query || '').get('voorbeeld') === '1') keep.set('voorbeeld', '1')
  const extra = keep.toString()
  return extra ? `${path}?${extra}` : path
}

export function withParam(path: string, key: string, value: string): string {
  const [base, query] = path.split('?')
  const params = new URLSearchParams(query || '')
  params.set(key, value)
  return `${base}?${params.toString()}`
}

/** Fragment voor de proxy, of een volledig document als er geen Shopify-handtekening is. */
export function mspResponse(fragment: string, liquid: boolean, status = 200): Response {
  const headers = {
    'Content-Type': liquid ? 'application/liquid; charset=utf-8' : 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  }
  if (fragment.startsWith('{% layout none %}')) {
    return new Response(fragment, { status, headers })
  }
  const css = mspCss()
  if (liquid) {
    return new Response(`<style>${css}</style>\n${fragment}`, { status, headers })
  }
  const body = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mijn SteraPro</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600&family=Instrument+Serif:ital@0;1&display=swap">
<style>
  :root { --font-instrument-sans: "Instrument Sans"; --font-instrument-serif: "Instrument Serif"; }
  body { margin: 0; background: #FFFDF7; color: #23322B; }
</style>
<style>${css}</style>
</head>
<body>
<div class="msp-root" style="padding-bottom:0">
  <p class="msp-banner">Voorbeeldweergave. Op sterapro.be komen de shopheader en -footer uit het thema.</p>
</div>
${fragment}
</body>
</html>`
  return new Response(body, { status, headers })
}
