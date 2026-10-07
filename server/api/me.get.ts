// GET /api/me — current user + resolved permissions (drives UI gating).
import { requireUser, STATEMENTS } from '../utils/permissions'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const effective: Record<string, string[]> = {}
  for (const [resource, set] of user.grants) {
    effective[resource] = [...set]
  }
  return {
    user: { id: user.userId, email: user.email, roles: user.roles },
    permissions: effective,
    vocabulary: STATEMENTS,
  }
})
