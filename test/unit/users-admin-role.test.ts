import { describe, expect, it } from 'vitest'
import { hasAdminRole } from '../../server/domains/users/users.service'

// The last-admin guard, the setPassword/update escalation guard and the
// pre-RBAC promotion migration all hinge on "is this role list admin?" being an
// EXACT comma-token test: a custom role merely named like "co-admin" must not
// count, and a list that carries admin among others must.
describe('hasAdminRole', () => {
  it('matches a bare admin role', () => {
    expect(hasAdminRole('admin')).toBe(true)
  })

  it('matches admin inside a comma list, ignoring whitespace', () => {
    expect(hasAdminRole('viewer,admin')).toBe(true)
    expect(hasAdminRole('viewer, admin ,ops')).toBe(true)
  })

  it('does not match look-alike role names', () => {
    expect(hasAdminRole('co-admin')).toBe(false)
    expect(hasAdminRole('non-admin')).toBe(false)
    expect(hasAdminRole('administrator')).toBe(false)
  })

  it('treats a missing role as non-admin', () => {
    expect(hasAdminRole(null)).toBe(false)
    expect(hasAdminRole(undefined)).toBe(false)
    expect(hasAdminRole('')).toBe(false)
  })
})
