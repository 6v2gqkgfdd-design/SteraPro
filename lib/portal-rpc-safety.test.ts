import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20261009140000_portal_customer_rpcs.sql',
  'utf8'
)
const middleware = readFileSync('middleware.ts', 'utf8')

function functionBody(name: string): string {
  const start = migration.indexOf(`function public.${name}(`)
  assert.ok(start > 0, `functie ${name} ontbreekt`)
  const next = migration.indexOf('\ncreate or replace function ', start + 10)
  const end = next === -1 ? migration.length : next
  return migration.slice(start, end)
}

test('portaal-preview is niet langer publiek', () => {
  assert.equal(middleware.includes('isPortalPreview'), false)
  assert.match(middleware, /my_portal_company/)
  assert.match(middleware, /\/portal\/login/)
})

test('klant-RPC\'s lekken geen interne notities of inkoopprijzen', () => {
  const forbidden = [
    'internal_notes',
    'access_notes',
    'supplier_unit_price_cents',
    'margin_pct',
    'cost_price',
    'purchase_price',
    'signature_data',
    'signature_ip',
    'companies.notes',
    'p.notes',
    'v.notes',
  ]
  for (const name of [
    'portal_my_company',
    'portal_my_plants',
    'portal_my_visits',
    'portal_my_work_orders',
    'portal_my_quotes',
    'portal_my_orders',
    'portal_my_requests',
  ]) {
    const body = functionBody(name)
    for (const word of forbidden) {
      assert.equal(body.includes(word), false, `${name} bevat ${word}`)
    }
  }

  const orders = functionBody('portal_my_orders')
  assert.equal(orders.includes('o.raw'), false)
  assert.equal(orders.includes('delivery_notes'), false)

  const quotes = functionBody('portal_my_quotes')
  assert.match(quotes, /'sent', 'accepted', 'declined', 'ordered', 'expired'/)
  assert.equal(quotes.includes('supplier_unit_price'), false)

  const workOrders = functionBody('portal_my_work_orders')
  assert.equal(workOrders.includes('signing_token'), false)
  assert.match(workOrders, /'sent', 'signed', 'invoiced', 'archived'/)

  const visits = functionBody('portal_my_visits')
  assert.equal(visits.includes('internal_notes'), false)
  assert.equal(visits.includes('access_notes'), false)
})

test('aanvraag-RPC schrijft alleen voor het eigen goedgekeurde bedrijf', () => {
  const body = functionBody('portal_create_plant_request')
  assert.match(body, /status = 'approved'/)
  assert.match(body, /portal_my_company_id|portal_contacts/)
  assert.doesNotMatch(body, /sendEmail|net\.smtp|pg_net/)
  assert.match(migration, /portal_requests/)
  assert.match(migration, /'nieuw'/)
})
