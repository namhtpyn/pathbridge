// Seed the default admin account at boot when the instance has NO users.
// A brand-new container therefore always has a known login:
//   email    = env ADMIN_EMAIL    (default admin@pathbridge.local)
//   password = env ADMIN_PASSWORD (default pathbridge-admin)
// The seed is skipped entirely when any user row exists (fresh-install-only),
// so restarts never overwrite real accounts. Change the password after
// first login, or set the env vars before first boot.
import { db } from '../db'
import { user } from '../db/schema'
import { createUser } from '../utils/users'

export default defineEventHandler(async () => {
  const existing = await db.query.user.findMany({ columns: { id: true } })
  if (existing.length > 0) return true

  const email = process.env.ADMIN_EMAIL || 'admin@pathbridge.local'
  const password = process.env.ADMIN_PASSWORD || 'pathbridge-admin'
  await createUser(email, 'Admin', password, 'admin')
  return true
})
