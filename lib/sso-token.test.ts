import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { issueSsoToken, verifySsoToken } from './sso-token.ts'

const prevProxy = process.env.SHOPIFY_PROXY_SECRET
const prevClient = process.env.SHOPIFY_CLIENT_SECRET

afterEach(() => {
  restore('SHOPIFY_PROXY_SECRET', prevProxy)
  restore('SHOPIFY_CLIENT_SECRET', prevClient)
})

function restore(name: 'SHOPIFY_PROXY_SECRET' | 'SHOPIFY_CLIENT_SECRET', value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe('sso token roundtrip', () => {
  test('roundtrip met alleen SHOPIFY_CLIENT_SECRET', () => {
    delete process.env.SHOPIFY_PROXY_SECRET
    process.env.SHOPIFY_CLIENT_SECRET = 'client-secret'
    const now = 1_700_000_000_000
    const token = issueSsoToken('Klant@SteraPro.be', { now })
    assert.equal(verifySsoToken(token, { now }), 'klant@sterapro.be')
  })

  test('roundtrip met alleen SHOPIFY_PROXY_SECRET', () => {
    process.env.SHOPIFY_PROXY_SECRET = 'proxy-secret'
    delete process.env.SHOPIFY_CLIENT_SECRET
    const now = 1_700_000_000_000
    const token = issueSsoToken('klant@sterapro.be', { now })
    assert.equal(verifySsoToken(token, { now }), 'klant@sterapro.be')
  })

  test('ondertekent met proxy-secret en aanvaardt ook een client-secret-token', () => {
    process.env.SHOPIFY_PROXY_SECRET = 'proxy-secret'
    process.env.SHOPIFY_CLIENT_SECRET = 'client-secret'
    const now = 1_700_000_000_000
    const issued = issueSsoToken('klant@sterapro.be', { now })
    const signedWithProxy = issueSsoToken('klant@sterapro.be', {
      now,
      secret: 'proxy-secret',
    })
    assert.equal(issued, signedWithProxy)
    assert.equal(verifySsoToken(issued, { now }), 'klant@sterapro.be')

    const signedWithClient = issueSsoToken('klant@sterapro.be', {
      now,
      secret: 'client-secret',
    })
    assert.notEqual(signedWithClient, issued)
    assert.equal(verifySsoToken(signedWithClient, { now }), 'klant@sterapro.be')
  })

  test('geweigerd na verval, bij sabotage en bij een ander geheim', () => {
    process.env.SHOPIFY_PROXY_SECRET = 'proxy-secret'
    delete process.env.SHOPIFY_CLIENT_SECRET
    const now = 1_000
    const token = issueSsoToken('klant@sterapro.be', { now, ttlMs: 60_000 })
    assert.equal(verifySsoToken(token, { now: now + 60_000 }), 'klant@sterapro.be')
    assert.equal(verifySsoToken(token, { now: now + 60_001 }), null)

    const [payload, sig] = token.split('.')
    const flipped = (payload.slice(-1) === 'a' ? 'b' : 'a')
    const tampered = `${payload.slice(0, -1)}${flipped}.${sig}`
    assert.equal(verifySsoToken(tampered, { now }), null)

    assert.equal(
      verifySsoToken(token, { now, secrets: ['andere-secret'] }),
      null
    )
    assert.equal(verifySsoToken(token, { now, secrets: [] }), null)
  })
})

describe('sso routes delen het geheim en eisen een goedgekeurd contact', () => {
  test('token-route en /sso gebruiken de gedeelde helper', () => {
    const tokenRoute = readFileSync('app/api/sso/token/route.ts', 'utf8')
    const ssoRoute = readFileSync('app/sso/route.ts', 'utf8')
    assert.match(tokenRoute, /issueSsoToken/)
    assert.match(ssoRoute, /verifySsoToken/)
    assert.doesNotMatch(ssoRoute, /SHOPIFY_PROXY_SECRET \|\| ''/)
    assert.match(ssoRoute, /status === 'approved'/)
    assert.match(ssoRoute, /\/portal\/registreren/)
  })
})
