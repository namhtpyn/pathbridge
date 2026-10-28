// keys module router: current-user API keys (create/rename/revoke)
import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { base, withUser, badRequest } from '../shared/context'
import type { Resource } from '../../lib/permissions'
import * as svc from './keys.service'

const keyCreateInput = z.strictObject({
  name: z.string().trim().min(1).max(64),
  expiresIn: z.number().int().positive().max(365 * 24 * 3600).optional(), // seconds; omit = no expiry
  permissions: z.record(z.string(), z.array(z.string())).optional(),
})

export const keysRouter = {
  /** current user's keys (ownership = referenceId); no secrets, real perms */
  list: base.use(withUser).handler(async ({ context }) => await svc.listKeys(context.user.userId)),

  create: base.use(withUser).input(keyCreateInput).handler(async ({ context, input }) => {
    const { getAuth } = await import('../../lib/auth')
    const { publishChange } = await import('../../lib/change-bus')
    // the RBAC vocabulary is the single validator (same check the roles API
    // uses) — a second hand-kept list drifts from it silently
    const { ACTIONS, SCOPES, STATEMENTS, validateStatements, userCan } = await import('../../lib/permissions')
    const clean: Record<string, string[]> = {}
    if (input.permissions) {
      const invalid = validateStatements(input.permissions)
      if (invalid) badRequest(invalid)
      for (const [resource, statements] of Object.entries(input.permissions)) {
        // narrow the raw key back through the vocabulary instead of casting to
        // userCan's parameter types (a cast would let an unknown value through)
        const key = (Object.keys(STATEMENTS) as Resource[]).find(k => k === resource)
        if (!key) badRequest(`unknown resource: ${resource}`)
        for (const st of statements) {
          // narrow-only: a key can never hold what its owner doesn't — request
          // time is where that must fail, not silently at first use
          const [rawAction, rawScope] = st.split(':')
          const action = ACTIONS.find(a => a === rawAction)
          const scope = SCOPES.find(s => s === rawScope)
          if (!action || !scope || !userCan(context.user, key, action, scope)) {
            badRequest(`cannot grant ${resource}:${st} — you do not hold it`)
          }
        }
        clean[key] = statements
      }
    }
    const auth = await getAuth()
    // the endpoint returns the full row (`...apiKey`, id included) but
    // better-auth's inferred return type only advertises key/referenceId
    const res = await auth.api.createApiKey({
      body: {
        name: input.name,
        userId: context.user.userId,
        ...(input.expiresIn ? { expiresIn: input.expiresIn } : {}),
        ...(Object.keys(clean).length > 0 ? { permissions: clean } : {}),
      },
    }) as { id: string, key: string, referenceId: string }
    await publishChange('keys', 'create')
    // id lets the client address the key (rename/revoke) without a refetch
    return { id: res.id, key: res.key, referenceId: res.referenceId, name: input.name }
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
