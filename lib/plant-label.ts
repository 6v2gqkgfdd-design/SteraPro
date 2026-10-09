import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { demoEnabled } from '@/lib/demo-session'
import { demoPublicPlant } from '@/lib/portal-demo-data'
import { plantPublicUrl } from '@/lib/msp-request'
import { escapeHtml } from '@/lib/email'

async function lookup(slug: string) {
  const demo = demoEnabled() ? demoPublicPlant(slug) : null
  if (demo) return { name: demo.nickname || demo.species || 'Plant', species: demo.species }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_public_plant', { _slug: slug })
    if (error || !data) return null
    return {
      name: String(data.nickname || data.species || 'Plant'),
      species: data.species ? String(data.species) : null,
    }
  } catch {
    return null
  }
}

export async function labelDocument(slug: string, backHref = `/p/${slug}`): Promise<string | null> {
  const plant = await lookup(slug)
  if (!plant) return null
  const url = plantPublicUrl(slug)
  const qr = await QRCode.toDataURL(url, { width: 480, margin: 0, errorCorrectionLevel: 'M' })
  const name = escapeHtml(plant.name)
  const latin =
    plant.species && plant.species !== plant.name
      ? `<p class="latin">${escapeHtml(plant.species)}</p>`
      : ''
  const inner = `<style>
  @page { size: 60mm 80mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F1EFE8; color: #23322B; font-family: "Instrument Sans", system-ui, sans-serif; }
  .sheet { width: 60mm; min-height: 80mm; margin: 16px auto; padding: 4mm; background: #FFFDF7; border: 1px solid rgba(47,88,64,.14); border-radius: 14px; text-align: center; }
  .logo { height: 12mm; width: auto; }
  .qr { width: 32mm; height: 32mm; margin: 3mm auto; }
  .name { margin: 2mm 0 0; color: #2F5840; font-size: 11pt; font-weight: 600; }
  .latin { margin: 1mm 0 0; font-family: "Instrument Serif", Georgia, serif; font-style: italic; font-weight: 400; font-size: 9pt; color: rgba(35,50,43,.72); }
  .hint { margin: 2mm 0 0; font-size: 8pt; color: rgba(35,50,43,.72); }
  .tools { max-width: 420px; margin: 24px auto; padding: 0 16px; font-size: 15px; }
  button { min-height: 48px; padding: 12px 24px; border-radius: 999px; border: 1.5px solid #2F5840; background: #2F5840; color: #FFFDF7; font: 600 15px/1.2 "Instrument Sans", system-ui, sans-serif; cursor: pointer; }
  a { color: #2F5840; }
  @media print {
    body { background: #FFFDF7; }
    .tools { display: none; }
    .sheet { margin: 0; border: none; border-radius: 0; box-shadow: none; }
  }
</style>
<div class="tools">
  <p><a href="${escapeHtml(backHref)}">Terug naar de plant</a></p>
  <h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;color:#2F5840">QR-label</h1>
  <p>Alleen de plant en de QR. Geen klantnaam.</p>
  <button type="button" onclick="window.print()">Afdrukken of bewaren als PDF</button>
</div>
<article class="sheet">
  <img class="logo" src="/sterapro-shop-logo.png" alt="SteraPro">
  <img class="qr" src="${qr}" alt="">
  <p class="name">${name}</p>
  ${latin}
  <p class="hint">sterapro.be · scan mij</p>
</article>`
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QR-label · ${name}</title>
</head>
<body>
${inner}
</body>
</html>`
}
