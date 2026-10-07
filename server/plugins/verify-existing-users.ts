// Pathbridge has no email-verification flow: every password login was set up by
// an admin or by the user themselves. better-auth's account linking requires
// email_verified for auto-linking OIDC logins to existing accounts, so at boot
// we canonicalize: any user with a credential (password) account is verified.
// Heals pre-1.24 instances whose users were created before createUser()
// defaulted emailVerified to true.
import { db } from '../db'
import { user, account } from '../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const credAccounts = await db.select({ userId: account.userId }).from(account).where(eq(account.providerId, 'credential'))
  const credUserIds = new Set(credAccounts.map(a => a.userId))
  const users = await db.select({ id: user.id, emailVerified: user.emailVerified }).from(user)
  let fixed = 0
  for (const u of users) {
    if (credUserIds.has(u.id) && !u.emailVerified) {
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, u.id))
      fixed++
    }
  }
  if (fixed > 0) console.log(`[boot] email_verified canonicalized for ${fixed} password user(s)`)
  return true
})
