// Unit tests for the permission core (RBAC resolution + narrowing).
import { describe, expect, it } from 'vitest'
import { userCan, validateStatements, STATEMENTS } from '../../server/utils/permissions'
import type { ResolvedUser } from '../../server/utils/permissions'

function userWith(grants: Record<string, string[]>): ResolvedUser {
  const map = new Map(Object.entries(grants).map(([k, v]) => [k, new Set(v)])) as ResolvedUser['grants']
  return { userId: 'u1', email: 'u@x.com', roles: ['custom'], grants: map }
}

describe('userCan (scope resolution)', () => {
  it('all implies own', () => {
    const u = userWith({ routes: ['read:all'] })
    expect(userCan(u, 'routes', 'read', 'all')).toBe(true)
    expect(userCan(u, 'routes', 'read', 'own')).toBe(true)
  })

  it('own does not imply all', () => {
    const u = userWith({ routes: ['read:own'] })
    expect(userCan(u, 'routes', 'read', 'own')).toBe(true)
    expect(userCan(u, 'routes', 'read', 'all')).toBe(false)
  })

  it('scope omitted accepts either', () => {
    expect(userCan(userWith({ routes: ['read:own'] }), 'routes', 'read')).toBe(true)
    expect(userCan(userWith({ routes: ['read:all'] }), 'routes', 'read')).toBe(true)
    expect(userCan(userWith({ logs: ['read:own'] }), 'routes', 'read')).toBe(false)
  })

  it('missing resource denies', () => {
    expect(userCan(userWith({}), 'routes', 'read')).toBe(false)
  })

  it('admin builtin vocabulary covers every resource with :all only', () => {
    for (const [resource, actions] of Object.entries(STATEMENTS)) {
      for (const a of actions) expect(a.endsWith(':all') || a.endsWith(':own')).toBe(true)
      expect(actions.length).toBeGreaterThan(0)
    }
    // ownable resources expose both scopes
    expect(STATEMENTS.routes).toContain('read:own')
    expect(STATEMENTS.routes).toContain('read:all')
    // non-ownable never expose :own
    for (const a of STATEMENTS.settings) expect(a.endsWith(':own')).toBe(false)
    for (const a of STATEMENTS.users) expect(a.endsWith(':own')).toBe(false)
    for (const a of STATEMENTS.roles) expect(a.endsWith(':own')).toBe(false)
  })
})

describe('validateStatements (role payload validation)', () => {
  it('accepts valid statements only from the vocabulary', () => {
    expect(validateStatements({ routes: ['read:all', 'update:own'] })).toBeNull()
    expect(validateStatements({})).toBeNull()
  })

  it('rejects unknown resources', () => {
    expect(validateStatements({ nonsense: ['read:all'] })).toMatch(/unknown resource/)
  })

  it('rejects malformed statements', () => {
    expect(validateStatements({ routes: ['read'] })).toMatch(/not a valid action:scope/)
    expect(validateStatements({ routes: ['read:world'] })).toMatch(/not a valid action:scope/)
    expect(validateStatements({ routes: 'read:all' as never })).toMatch(/must be an array/)
  })

  it('rejects statements outside the resource vocabulary (keys: own on settings)', () => {
    expect(validateStatements({ settings: ['update:own'] })).toMatch(/not valid for resource/)
    expect(validateStatements({ settings: ['update:all'] })).toBeNull()
  })
})
