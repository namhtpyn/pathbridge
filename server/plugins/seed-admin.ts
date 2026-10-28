// Seed the initial admin account at boot when the instance has NO users.
//   email    = env ADMIN_EMAIL    (default admin@pathbridge.local)
//   password = env ADMIN_PASSWORD — when unset, a RANDOM password is generated
//   and printed ONCE to the boot log (never a guessable default on the wire).
// The seed is skipped entirely when any user row exists (fresh-install-only),
// so restarts never overwrite real accounts.
import { db } from '../db'
import { user } from '../db/schema'
import { createUser } from '../domains/users/users.service'

export default defineNitroPlugin(async () => {
  const existing = await db.query.user.findMany({ columns: { id: true } })
  if (existing.length > 0) return

  const email = process.env.ADMIN_EMAIL || 'admin@pathbridge.local'
  const generated = !process.env.ADMIN_PASSWORD
  const password = process.env.ADMIN_PASSWORD || crypto.randomUUID().replaceAll('-', '')
  await createUser(email, 'Admin', password, 'admin')
  if (generated) {
    console.warn(`[seed-admin] no ADMIN_PASSWORD set — generated one-time password for ${email}: ${password}`)
    console.warn('[seed-admin] this line appears only once; store it now')
  }
})
