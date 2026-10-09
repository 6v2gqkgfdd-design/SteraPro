import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { mspAls, mspHref, plantPublicUrl } from './msp-request.ts'

test('proxy-links blijven onder /apps/mijn', () => {
  mspAls.run({ base: '/apps/mijn/voorbeeld', demo: true, liquid: true }, () => {
    assert.equal(mspHref('/portal/onderhoud'), '/apps/mijn/voorbeeld/onderhoud')
    assert.equal(mspHref('/portal/planten/abc'), '/apps/mijn/voorbeeld/planten/abc')
    assert.equal(mspHref('/p/x'), '/apps/mijn/p/x')
    assert.equal(mspHref('/q/abc'), '/q/abc')
  })
  assert.equal(mspHref('/portal/dashboard'), '/portal/dashboard')
  assert.equal(plantPublicUrl('dk-7f3a9c2e1b4d8a60e1'), 'https://sterapro.be/apps/mijn/p/dk-7f3a9c2e1b4d8a60e1')
})

test('login is de beginstand en de QR gebruikt het shoplogo', () => {
  const login = readFileSync('app/portal/login/login-form.tsx', 'utf8')
  const why = readFileSync('components/why-account.tsx', 'utf8')
  const qr = readFileSync('app/p/[slug]/page.tsx', 'utf8')
  const report = readFileSync('app/p/[slug]/report/page.tsx', 'utf8')
  const label = readFileSync('lib/plant-label.ts', 'utf8')
  const logo = readFileSync('lib/msp-request.ts', 'utf8')
  const middleware = readFileSync('middleware.ts', 'utf8')
  assert.match(login, /WhyAccount/)
  assert.match(why, /Waarom een account/)
  assert.match(why, /Je krijgt toegang na je eerste bestelling/)
  assert.equal(login.includes("useState<'register'"), false)
  assert.equal(login.includes('stera-logo.png'), false)
  assert.match(logo, /https:\/\/app\.sterapro\.be\/sterapro-shop-logo\.png/)
  assert.match(qr, /SHOP_LOGO_URL/)
  assert.match(report, /SHOP_LOGO_URL/)
  assert.match(label, /SHOP_LOGO_URL/)
  assert.equal(qr.includes('kiplekker'), false)
  assert.equal(qr.includes('/stera-logo.png'), false)
  assert.match(label, /@page \{ size: 60mm 80mm/)
  assert.match(label, /Instrument Serif/)
  assert.match(label, /MSP_FONT_LINK/)
  assert.match(logo, /fonts\.googleapis\.com/)
  assert.equal(label.includes('Georgia,serif'), false)
  const css = readFileSync('app/msp.css', 'utf8')
  assert.match(css, /--font-instrument-sans:/)
  assert.match(css, /var\(--font-instrument-sans, "Instrument Sans"/)
  assert.match(middleware, /\/apps\/mijn/)
  assert.match(middleware, /app\.sterapro\.be/)
})
