// users module router
import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { base, withPerm, badRequest, liveGenerator } from '../shared/context'

const userSaveInput = z.strictObject({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  role: z.string().regex(/^[a-z0-9][a-z0-9,-]*[a-z0-9]$/).optional(),
  emailVerified: z.boolean().optional(),
})

const userUpdateInput = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  emailVerified: z.boolean().optional(),
  role: z.string().regex(/^[a-z0-9][a-z0-9,-]*[a-z0-9]$/).optional(),
})

export const usersRouter = {
  /** one-shot user list (live twin below for realtime UIs) */
  list: base.use(withPerm('users', 'read')).handler(async () => ({ users: await (await import('../../utils/users')).listUsers() })),

  /** live user list — refreshes on any users change */
  live: base.use(withPerm('users', 'read')).handler(() => liveGenerator(['users'], async () => ({ users: await (await import('../../utils/users')).listUsers() }))),

  save: base.use(withPerm('users', 'create')).input(userSaveInput).handler(async ({ context, input }) => {
    const { publishChange } = await import('../../utils/change-bus')
    // assigning a role requires roles:update (viewer default otherwise)
    let role = 'viewer'
    if (input.role) {
      const { userCan } = await import('../../utils/permissions')
      if (!userCan(context.user, 'roles', 'update')) {
        throw new ORPCError('FORBIDDEN', { message: 'missing permission roles:update (needed to assign a role)' })
      }
      role = input.role
    }
    try {
      await (await import('../../utils/users')).createUser(input.email, input.name, input.password, role, input.emailVerified ?? true)
      await publishChange('users', 'create')
      return { ok: true }
    }
    catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'email already in use' : 'create failed'
      throw new ORPCError('CONFLICT', { message: msg })
    }
  }),

  update: base.use(withPerm('users', 'update')).input(userUpdateInput).handler(async ({ context, input }) => {
    const { publishChange } = await import('../../utils/change-bus')
    const { userCan } = await import('../../utils/permissions')
    if (input.role !== undefined && !userCan(context.user, 'roles', 'update')) {
      throw new ORPCError('FORBIDDEN', { message: 'missing permission roles:update (needed to assign a role)' })
    }
    const { id, ...patch } = input
    if (Object.keys(patch).length === 0) badRequest('nothing to update')
    await (await import('../../utils/users')).updateUser(id, patch)
    await publishChange('users', 'update')
    return { ok: true }
  }),

  setPassword: base.use(withPerm('users', 'update')).input(z.strictObject({
    id: z.string().min(1),
    password: z.string().min(8).max(128),
  })).handler(async ({ input }) => {
    await (await import('../../utils/users')).setPassword(input.id, input.password)
    return { ok: true }
  }),

  remove: base.use(withPerm('users', 'delete')).input(z.strictObject({
    id: z.string().min(1),
  })).handler(async ({ context, input }) => {
    const { publishChange } = await import('../../utils/change-bus')
    if (input.id === context.user.userId) badRequest('cannot delete your own account')
    await (await import('../../utils/users')).deleteUser(input.id)
    await publishChange('users', 'delete')
    return { ok: true }
  }),
}
