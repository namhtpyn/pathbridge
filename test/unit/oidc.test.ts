// Unit tests for OIDC provider id handling (callback-path crafting guard).
import { describe, expect, it } from 'vitest'
import { validProviderId, newProviderId, providersToPublic } from '../../server/domains/oidc/oidc.service'

describe('provider ids', () => {
  it('accepts uuids not in the reserved set', () => {
    expect(validProviderId(crypto.randomUUID())).toBe(true)
  })

  it('rejects reserved ids that would collide with better-auth core routes', () => {
    for (const id of ['email', 'credential', 'oauth2', 'callback', 'error', 'ok', 'api-key']) {
      // reserved ids are slugs, not uuids — already invalid; the guard is defense in depth
      expect(validProviderId(id)).toBe(false)
    }
  })

  it('rejects non-uuid slugs (client-chosen ids are never valid)', () => {
    expect(validProviderId('my-provider')).toBe(false)
    expect(validProviderId('admin')).toBe(false)
    expect(validProviderId('')).toBe(false)
    expect(validProviderId('00000000-0000-0000-0000-000000000000')).toBe(true) // uuid-shaped passes (not reserved)
  })

  it('newProviderId always returns a valid uuid', () => {
    for (let i = 0; i < 20; i++) {
      const id = newProviderId()
      expect(validProviderId(id)).toBe(true)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    }
  })

  it('providersToPublic never leaks client secrets', () => {
    const pub = providersToPublic([
      { id: crypto.randomUUID(), label: 'X', issuer: 'https://x.com', clientId: 'cid', clientSecret: 'super-secret' },
    ])
    expect(JSON.stringify(pub)).not.toContain('super-secret')
    expect(pub[0]!.secretSet).toBe(true)
  })
})
