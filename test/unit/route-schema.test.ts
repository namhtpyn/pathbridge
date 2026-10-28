// Unit tests for the STRICT backend route schema (security boundary).
import { describe, expect, it } from 'vitest'
import { routeInputSchema, headerOverridesSchema, methodsSchema } from '../../server/domains/routes/routes.schema'

describe('routeInputSchema (strict security boundary)', () => {
  const valid = { path: '/hook', target: 'https://api.example.com' }

  it('accepts a minimal valid route', () => {
    const r = routeInputSchema.safeParse(valid)
    expect(r.success).toBe(true)
    if (!r.success) return
    // `enabled` is NOT defaulted at the schema: a materialized default would make
    // an update that omits it silently re-enable a disabled route (service applies
    // the create-time default instead)
    expect('enabled' in r.data).toBe(false)
    expect(r.data.enabled).toBeUndefined()
  })

  it('keeps an explicit enabled: false (no schema default overrides it)', () => {
    const r = routeInputSchema.safeParse({ ...valid, enabled: false })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.enabled).toBe(false)
  })

  it('rejects unknown keys (strict)', () => {
    const r = routeInputSchema.safeParse({ ...valid, evil: 'x' })
    expect(r.success).toBe(false)
  })

  it('rejects non-http(s) targets', () => {
    for (const target of ['ftp://x.com', 'file:///etc/passwd', 'javascript:alert(1)']) {
      expect(routeInputSchema.safeParse({ ...valid, target }).success).toBe(false)
    }
  })

  it('rejects targets with query or fragment', () => {
    expect(routeInputSchema.safeParse({ ...valid, target: 'https://x.com/?a=1' }).success).toBe(false)
    expect(routeInputSchema.safeParse({ ...valid, target: 'https://x.com/#f' }).success).toBe(false)
  })

  it('accepts a target with a base path (forwarded as prefix)', () => {
    const r = routeInputSchema.safeParse({ ...valid, target: 'https://x.com/base/path' })
    expect(r.success).toBe(true)
  })

  it('rejects reserved paths', () => {
    for (const path of ['/', '/admin', '/admin/x', '/auth', '/auth/x', '/health', '/health/x', '/api', '/api/x', '/mcp', '/mcp/x', '/rpc', '/rpc/x', '/_internal']) {
      const r = routeInputSchema.safeParse({ ...valid, path })
      if (r.success) throw new Error(`reserved path accepted: ${path}`)
    }
  })

  it('rejects mid-path and non-trailing wildcards', () => {
    for (const path of ['/a*b/c', '/hook/*x', '/*hook', '/hook/**', '/hook/*/']) {
      const r = routeInputSchema.safeParse({ ...valid, path })
      if (r.success) throw new Error(`bad wildcard accepted: ${path}`)
    }
  })

  it('rejects bare /* — wildcards need a non-empty base (SPEC: "/" is reserved for the redirect)', () => {
    expect(routeInputSchema.safeParse({ ...valid, path: '/*' }).success).toBe(false)
  })

  it('methods: rejects duplicates, empty list, unknown verbs', () => {
    expect(methodsSchema.safeParse(['GET']).success).toBe(true)
    expect(methodsSchema.safeParse([]).success).toBe(false)
    expect(methodsSchema.safeParse(['GET', 'GET']).success).toBe(false)
    expect(methodsSchema.safeParse(['GET', 'TRACE' as never]).success).toBe(false)
  })
})

describe('headerOverridesSchema (v4 header overrides)', () => {
  it('accepts set with value and remove without value', () => {
    expect(headerOverridesSchema.safeParse([{ name: 'host', op: 'set', value: 'x.com' }]).success).toBe(true)
    expect(headerOverridesSchema.safeParse([{ name: 'cookie', op: 'remove' }]).success).toBe(true)
  })

  it('rejects set without value', () => {
    expect(headerOverridesSchema.safeParse([{ name: 'host', op: 'set' }]).success).toBe(false)
    expect(headerOverridesSchema.safeParse([{ name: 'host', op: 'set', value: '' }]).success).toBe(false)
  })

  it('rejects hop-by-hop header overrides (framing attacks)', () => {
    for (const name of ['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'te', 'trailer', 'upgrade', 'proxy-authorization']) {
      const r = headerOverridesSchema.safeParse([{ name, op: 'set', value: 'x' }])
      if (r.success) throw new Error(`hop-by-hop header allowed: ${name}`)
    }
  })

  it('normalizes names to lowercase and rejects invalid ones', () => {
    const r = headerOverridesSchema.safeParse([{ name: '  X-Custom ', op: 'set', value: 'v' }])
    expect(r.success).toBe(true)
    if (r.success) expect(r.data[0]!.name).toBe('x-custom')
    expect(headerOverridesSchema.safeParse([{ name: 'bad name\r\n', op: 'set', value: 'v' }]).success).toBe(false)
  })

  it('rejects values with newlines (header injection)', () => {
    expect(headerOverridesSchema.safeParse([{ name: 'x', op: 'set', value: 'a\r\nb' }]).success).toBe(false)
    expect(headerOverridesSchema.safeParse([{ name: 'x', op: 'set', value: 'a\nb' }]).success).toBe(false)
  })

  it('caps at 20 per direction and rejects duplicate names', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ name: `x-${i}`, op: 'set' as const, value: 'v' }))
    expect(headerOverridesSchema.safeParse(many).success).toBe(false)
    expect(headerOverridesSchema.safeParse([
      { name: 'x', op: 'set', value: '1' },
      { name: 'x', op: 'remove' },
    ]).success).toBe(false)
  })
})
