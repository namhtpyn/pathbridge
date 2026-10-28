// Seed the initial admin account at boot when the instance has NO users.
//   email    = env ADMIN_EMAIL    (default admin@pathbridge.local)
//   password = env ADMIN_PASSWORD — when unset, a RANDOM password is generated
//   and printed ONCE to the boot log (never a guessable default on the wire).
// The seed is skipped entirely when any user row exists (fresh-install-only),
// so restarts never overwrite real accounts.
//
// Nitro invokes plugins fire-and-forget and in no fixed order, so this is the
// ONE awaited boot orchestrator: builtin roles first (createUser validates
// them), then the email_verified heal, then the admin account.
import { db } from '../db'
import { user } from '../db/schema'
import { createUser } from '../domains/users/users.service'
import { once } from '../lib/once'
import { seedRoles } from '../lib/bootstrap/seed-roles'
import { verifyExistingUsers } from '../lib/bootstrap/verify-existing-users'

async function seedAdmin() {
  const existing = await db.query.user.findFirst({ columns: { id: true } })
  if (existing) return

  const email = process.env.ADMIN_EMAIL || 'admin@pathbridge.local'
  const generated = !process.env.ADMIN_PASSWORD
  const password = process.env.ADMIN_PASSWORD || crypto.randomUUID().replaceAll('-', '')
  await createUser(email, 'Admin', password, 'admin')
  if (generated) {
    console.warn(`[seed-admin] no ADMIN_PASSWORD set — generated one-time password for ${email}: ${password}`)
    console.warn('[seed-admin] this line appears only once; store it now')
  }
}

async function bootstrap() {
  // one failing step must not skip the others (or crash boot)
  try {
    await seedRoles()
  }
  catch (e) {
    console.error('[boot] seed-roles failed:', e)
  }
  try {
    await verifyExistingUsers()
  }
  catch (e) {
    console.error('[boot] verify-existing-users failed:', e)
  }
  try {
    await seedAdmin()
  }
  catch (e) {
    console.error('[boot] seed-admin failed:', e)
  }
}

/** The shared boot seed. Exported so the request hook below (and any other
 *  bootstrap step) awaits the SAME run instead of starting a second one. */
export const seedPromise = once(bootstrap)

export default defineNitroPlugin((nitroApp) => {
  // Nitro does not await plugins, so without this the first request could hit
  // an empty roles/users table while the seed is still running. `request`
  // hooks are awaited before the route handler runs.
  nitroApp.hooks.hook('request', () => seedPromise())
})
