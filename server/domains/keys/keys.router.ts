// keys module router: current-user API keys (create/rename/revoke)
import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { base, withUser, badRequest } from '../shared/context'
import * as svc from './keys.service'

const keyCreateInput = z.strictObject({
  name: z.string().min(1).max(64),
  expiresIn: z.number().int().positive().max(365 * 24 * 3600).optional(), // seconds; omit = no expiry
  permissions: z.record(z.string(), z.array(z.string())).optional(),
})

export const keysRouter = {
  /** current user's keys (ownership = referenceId); no secrets, real perms */
  list: base.use(withUser).handler(async ({ context }) => await svc.listKeys(context.user.userId)),

  create: base.use(withUser).input(keyCreateInput).handler(async ({ context, input }) => {
    const { getAuth } = await import('../../lib/auth')
    const { publishChange } = await import('../../lib/change-bus')
    // validate resource names + statements exist in the RBAC vocabulary
    const { STATEMENTS, userCan } = await import('../../lib/permissions')
    const clean: Record<string, string[]> = {}
    if (input.permissions) {
      const vocabulary = STATEMENTS as Record<string, readonly string[]>
      for (const [resource, statements] of Object.entries(input.permissions)) {
        const vocab = vocabulary[resource]
        if (!vocab) badRequest(`unknown resource: ${resource}`)
        for (const st of statements) {
          if (!vocab.includes(st)) badRequest(`unknown statement ${resource}:${st}`)
          // narrow-only: a key can never hold what its owner doesn't — request
          // time is where that must fail, not silently at first use
          const [action, scope] = st.split(':')
          if ((action !== 'read' && action !== 'create' && action !== 'update' && action !== 'delete') || (scope !== 'own' && scope !== 'all')) {
            badRequest(`unknown statement ${resource}:${st}`)
          }
          type Ctx = Parameters<typeof userCan>
          const held = userCan(context.user, resource as Ctx[1], action as Ctx[2], scope as Ctx[3])
          if (!held) badRequest(`cannot grant ${resource}:${st} — you do not hold it`)
        }
        clean[resource] = statements
      }
    }
    const auth = await getAuth()
    const res = await auth.api.createApiKey({
      body: {
        name: input.name,
        userId: context.user.userId,
        ...(input.expiresIn ? { expiresIn: input.expiresIn } : {}),
        ...(Object.keys(clean).length > 0 ? { permissions: clean } : {}),
      },
    })
    await publishChange('keys', 'create')
    return { key: res.key, referenceId: res.referenceId, name: input.name }
  }),

  revoke: base.use(withUser).input(z.strictObject({ id: z.string().min(1) })).handler(async ({ context, input }) => {
    const { publishChange } = await import('../../lib/change-bus')
    // verify ownership before revoking (key must belong to the caller)
    await svc.requireOwnedKey(input.id, context.user.userId)
    await svc.deleteKey(input.id)
    await publishChange('keys', 'delete')
    return { ok: true }
  }),

  /** rename an own key (auth.api.updateApiKey enforces the plugin's rules) */
  rename: base.use(withUser).input(z.strictObject({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(64),
  })).handler(async ({ context, input }) => {
    const { publishChange } = await import('../../lib/change-bus')
    // ownership first: same rule as revoke — no renaming other people's keys
    await svc.requireOwnedKey(input.id, context.user.userId)
    const { getAuth } = await import('../../lib/auth')
    const auth = await getAuth()
    // endpoint-style call: needs the caller's session headers
    if (!context.reqHeaders) throw new ORPCError('UNAUTHORIZED', { message: 'missing session headers' })
    await auth.api.updateApiKey({
      headers: context.reqHeaders,
      body: { keyId: input.id, userId: context.user.userId, name: input.name },
    })
    await publishChange('keys', 'update')
    return { ok: true }
  }),
}
