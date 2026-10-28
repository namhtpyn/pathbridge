// Unit tests for the proxy route-matching core. The pure matching math lives
// in server/lib/route-match.ts (imported by the bridge middleware) — these
// tests exercise the REAL module, not a re-implementation, so any change to
// the matching/strip/specificity laws fails here immediately.
import { describe, expect, it } from 'vitest'
import { routeMatches, strip, specificity, pickRoute } from '../../server/lib/route-match'

describe('route matching laws (lib/route-match)', () => {
  it('exact path matches only itself', () => {
    expect(routeMatches('/hook', '/hook')).toBe(true)
    expect(routeMatches('/hook', '/hook/x')).toBe(false)
    expect(routeMatches('/hook', '/hooks')).toBe(false)
    expect(routeMatches('/hook', '/')).toBe(false)
  })

  it('wildcard matches the base and everything beneath, not siblings', () => {
    expect(routeMatches('/hook/*', '/hook')).toBe(true)
    expect(routeMatches('/hook/*', '/hook/a')).toBe(true)
    expect(routeMatches('/hook/*', '/hook/a/b')).toBe(true)
    expect(routeMatches('/hook/*', '/hooks')).toBe(false)
    expect(routeMatches('/hook/*', '/hookx')).toBe(false)
  })

  it('root wildcard matches everything', () => {
    expect(routeMatches('/*', '/')).toBe(true)
    expect(routeMatches('/*', '/anything')).toBe(true)
    expect(routeMatches('/*', '/deep/path')).toBe(true)
  })

  it('strip removes the base, keeps the rest with leading slash', () => {
    expect(strip('/hook/*', '/hook')).toBe('/')
    expect(strip('/hook/*', '/hook/x')).toBe('/x')
    expect(strip('/hook/*', '/hook/a/b')).toBe('/a/b')
  })

  it('specificity: exact beats wildcard; longer base beats shorter', () => {
    expect(specificity('/hook')).toBeGreaterThan(specificity('/hook/*'))
    expect(specificity('/api/v2/*')).toBeGreaterThan(specificity('/api/*'))
    expect(specificity('/*')).toBeLessThan(specificity('/api/*'))
  })

  it('pickRoute: longest prefix wins across mixed candidates; no match → null', () => {
    const routes = [
      { id: 1, path: '/*' },
      { id: 2, path: '/api/*' },
      { id: 3, path: '/api/v2/*' },
      { id: 4, path: '/api/v2/users' },
    ]
    expect(pickRoute(routes, '/api/v2/users')?.id).toBe(4)
    expect(pickRoute(routes, '/api/v2/other')?.id).toBe(3)
    expect(pickRoute(routes, '/api/other')?.id).toBe(2)
    expect(pickRoute(routes, '/unrelated')?.id).toBe(1)
    expect(pickRoute([], '/x')).toBeNull()
  })
})
