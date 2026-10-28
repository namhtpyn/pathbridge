// users module router
import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { base, withPerm, badRequest, notFound, liveGenerator } from '../shared/context'

const userSaveInput = z.strictObject({
  email: z.email().max(255),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  role: z.string().regex(/^[a-z0-9][a-z0-9,-]*[a-z0-9]$/).optional(),
  emailVerified: z.boolean().optional(),
})

const userUpdateInput = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  email: z.email().max(255).optional(),
  emailVerified: z.boolean().optional(),
  role: z.string().regex(/^[a-z0-9][a-z0-9,-]*[a-z0-9]$/).optional(),
})

export const usersRouter = {
  /** one-shot user list (live twin below for realtime UIs) */
  list: base.use(withPerm('users', 'read')).handler(async () => ({ users: await (await import('./users.service')).listUsers() })),

  /** live user list — refreshes on any users change */
  live: base.use(withPerm('users', 'read')).handler(() => liveGenerator(['users'], async () => ({ users: await (await import('./users.service')).listUsers() }))),

  save: base.use(withPerm('users', 'create')).input(userSaveInput).handler(async ({ context, input }) => {
    const { publishChange } = await import('../../lib/change-bus')
    // assigning a role requires roles:update (viewer default otherwise)
    let role = 'viewer'
    if (input.role) {
      const { userCan } = await import('../../lib/permissions')
      if (!userCan(context.user, 'roles', 'update')) {
        throw new ORPCError('FORBIDDEN', { message: 'missing permission roles:update (needed to assign a role)' })
      }
      role = input.role
    }
    try {
      await (await import('./users.service')).createUser(input.email, input.name, input.password, role, input.emailVerified ?? true)
      await publishChange('users', 'create')
      return { ok: true }
    }
    catch (e: unknown) {
      if (e instanceof ORPCError) throw e // validation from the service (unknown role)
      if (e instanceof Error && e.message.includes('UNIQUE')) {
        throw new ORPCError('CONFLICT', { message: 'email already in use' })
      }
      console.error('[users] create failed:', e)
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'create failed' })
    }
  }),

  update: base.use(withPerm('users', 'update')).input(userUpdateInput).handler(async ({ context, input }) => {
    const { publishChange } = await import('../../lib/change-bus')
    const { userCan } = await import('../../lib/permissions')
    if (input.role !== undefined && !userCan(context.user, 'roles', 'update')) {
      throw new ORPCError('FORBIDDEN', { message: 'missing permission roles:update (needed to assign a role)' })
    }
    const { id, ...patch } = input
    if (Object.keys(patch).length === 0) badRequest('nothing to update')
    const updated = await (await import('./users.service')).updateUser(id, patch)
    if (!updated) notFound('user not found')
    await publishChange('users', 'update')
    return { ok: true }
  }),

  setPassword: base.use(withPerm('users', 'update')).input(z.strictObject({
    id: z.string().min(1),
    password: z.string().min(8).max(128),
  })).handler(async ({ input }) => {
    const done = await (await import('./users.service')).setPassword(input.id, input.password)
    if (!done) notFound('user not found')
    const { publishChange } = await import('../../lib/change-bus')
    await publishChange('users', 'update')
    return { ok: true }
  }),

  remove: base.use(withPerm('users', 'delete')).input(z.strictObject({
    id: z.string().min(1),
  })).handler(async ({ context, input }) => {
    const { publishChange } = await import('../../lib/change-bus')
    if (input.id === context.user.userId) badRequest('cannot delete your own account')
    await (await import('./users.service')).deleteUser(input.id)
    await publishChange('users', 'delete')
    return { ok: true }
  }),
}
