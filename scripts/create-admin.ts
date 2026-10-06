// Seed the first (admin) user: bun scripts/create-admin.ts <email> <password>
import { auth } from '../server/utils/auth'

const email = process.argv[2]
const password = process.argv[3]
if (!email || !password) {
  console.log('usage: bun scripts/create-admin.ts <email> <password>')
  process.exit(1)
}

try {
  const res = await auth.api.signUpEmail({
    body: { email, password, name: (email.split('@')[0] ?? email) },
  })
  console.log('admin created:', !!res)
}
catch (e: unknown) {
  console.log('failed:', e instanceof Error ? e.message : String(e))
  process.exit(1)
}
process.exit(0)
