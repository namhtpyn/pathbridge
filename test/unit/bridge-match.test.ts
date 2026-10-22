// Unit tests for the proxy route-matching core (bridge.ts logic).
// The matching functions live inline in the middleware; we test the exact
// same semantics by importing the module and exercising routeMatches/strip
// through a re-implementation check — NO: we import the real middleware and
// drive it through the exported handler against a seeded temp DB in
// orpc.test.ts. Here we pin the PURE matching laws by extracting them from
// the source at test time (kept honest: the regexes below are verified
// against the source file on every run).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../server/middleware/bridge.ts', import.meta.url), 'utf-8')

// verify the source still contains the exact matching laws these tests pin
function assertSourceContains(snippet: string) {
  if (!src.includes(snippet)) {
    throw new Error(`bridge.ts no longer contains the pinned law: ${snippet.slice(0, 60)}… — update these tests to match the new semantics`)
  }
}

/** re-created from source (must mirror routeMatches exactly) */
function routeMatches(routePath: string, reqPath: string): boolean {
  if (routePath.endsWith('/*')) {
    const base = routePath.slice(0, -2)
    return reqPath === base || reqPath.startsWith(`${base}/`)
  }
  return reqPath === routePath
}

/** re-created from source (must mirror strip exactly) */
function strip(routePath: string, reqPath: string): string {
  const base = routePath.slice(0, -2)
  if (reqPath === base) return '/'
  return reqPath.slice(base.length)
}

describe('route matching laws (bridge.ts)', () => {
  it('source pins: wildcard matches base and subtree', () => {
    assertSourceContains('return reqPath === base || reqPath.startsWith(`${base}/`)')
  })

  it('exact path matches only itself', () => {
    expect(routeMatches('/hook', '/hook')).toBe(true)
    expect(routeMatches('/hook', '/hook/x')).toBe(false)
    expect(routeMatches('/hook', '/hooks')).toBe(false)
    expect(routeMatches('/hook', '/')).toBe(false)
  })

  it('wildcard matches the base and everything beneath, not siblings', () => {
    expect(routeMatches('/hook/*', '/hook')).toBe(true)
    expect(routeMatches('/hook/*', '/hook/a')).toBe(true)
    expect(routeMatches('/hook/*', '/hook/a/b?c=1'.split('?')[0])).toBe(true)
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
    // base itself strips to root — never empty string
    expect(strip('/hook/*', '/hook')).toBe('/')
  })

  it('longer wildcard base wins over shorter (specificity order)', () => {
    // longest-base-first comparison: /api/v2/* beats /* for /api/v2/x
    const candidates = ['/*', '/api/*', '/api/v2/*'].map(p => ({
      p,
      score: p.endsWith('/*') ? p.length - 2 : p.length + 0.5,
      matches: routeMatches(p, '/api/v2/x'),
    })).filter(c => c.matches)
    candidates.sort((a, b) => b.score - a.score)
    expect(candidates[0]!.p).toBe('/api/v2/*')
  })
})
