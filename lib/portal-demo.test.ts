import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { demoEnabled, issueDemoSession, verifyDemoSession } from './demo-session.ts'
import { emailDeliveryMode } from './email.ts'
import { DEMO_SLUGS, demoPublicPlant } from './portal-demo-data.ts'

const previous = {
  vercel: process.env.VERCEL_ENV,
  demo: process.env.PORTAL_DEMO_MODE,
  email: process.env.EMAIL_MODE,
}

function restore() {
  if (previous.vercel === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = previous.vercel
  if (previous.demo === undefined) delete process.env.PORTAL_DEMO_MODE
  else process.env.PORTAL_DEMO_MODE = previous.demo
  if (previous.email === undefined) delete process.env.EMAIL_MODE
  else process.env.EMAIL_MODE = previous.email
}

test('demo staat uit op productie tenzij je hem aanzet', () => {
  delete process.env.PORTAL_DEMO_MODE
  process.env.VERCEL_ENV = 'production'
  assert.equal(demoEnabled(), false)
  process.env.PORTAL_DEMO_MODE = '1'
  assert.equal(demoEnabled(), true)
  process.env.PORTAL_DEMO_MODE = 'off'
  assert.equal(demoEnabled(), false)
  delete process.env.PORTAL_DEMO_MODE
  delete process.env.VERCEL_ENV
  assert.equal(demoEnabled(), true)
  restore()
})

test('preview logt mail en verstuurt ze niet', () => {
  delete process.env.EMAIL_MODE
  process.env.VERCEL_ENV = 'preview'
  assert.equal(emailDeliveryMode(), 'log')
  process.env.VERCEL_ENV = 'production'
  assert.equal(emailDeliveryMode(), 'send')
  process.env.EMAIL_MODE = 'log'
  assert.equal(emailDeliveryMode(), 'log')
  restore()
})

test('democookie rondreis', async () => {
  delete process.env.VERCEL_ENV
  delete process.env.PORTAL_DEMO_MODE
  const token = await issueDemoSession()
  assert.ok(token)
  assert.equal(await verifyDemoSession(token), true)
  assert.equal(await verifyDemoSession(`${token}x`), false)
  restore()
})

test('publieke demo-QR toont geen klantnaam of prijs', () => {
  const plant = demoPublicPlant(DEMO_SLUGS.lobby)
  assert.ok(plant)
  const json = JSON.stringify(plant)
  assert.equal(json.includes('Demo Kantoor'), false)
  assert.equal(json.includes('186'), false)
  assert.equal('customer_note' in plant!, false)
  assert.equal(demoPublicPlant('niet-een-demo'), null)
  restore()
})

test('QR-pad is publiek en de demosessie opent het portaal', () => {
  const middleware = readFileSync('middleware.ts', 'utf8')
  assert.match(middleware, /path\.startsWith\('\/p\/'\)/)
  assert.match(middleware, /verifyDemoSession/)
  assert.match(middleware, /\/apps\/mijn/)
  const seed = readFileSync('supabase/seed/demo_kantoor.sql', 'utf8')
  assert.match(seed, /raise exception/)
})
