// roles module router
import { z } from 'zod'
import { base, withPerm, liveGenerator } from '../shared/context'
import * as svc from './roles.service'

const roleSaveInput = z.strictObject({
  name: z.string().min(2).max(32).regex(/^[a-z0-9][a-z0-9-]{1,31}$/, 'name: 2-32 chars, lowercase letters/digits/hyphens'),
  description: z.string().max(500).nullable().optional(),
  statements: z.record(z.string(), z.array(z.string())).optional(),
})

const roleUpdateInput = z.strictObject({
  id: z.string().min(1),
  description: z.string().max(500).nullable().optional(),
  statements: z.record(z.string(), z.array(z.string())).optional(),
})

export const rolesRouter = {
  /** one-shot role list + vocabulary (live twin below for realtime UIs) */
  list: base.use(withPerm('roles', 'read')).handler(async () => await svc.listRoles()),

  /** live role list — refreshes on any roles change */
  live: base.use(withPerm('roles', 'read')).handler(() => liveGenerator(['roles'], async () => await svc.listRoles())),

  save: base.use(withPerm('roles', 'create')).input(roleSaveInput).handler(async ({ input }) => await svc.createRole(input)),

  update: base.use(withPerm('roles', 'update')).input(roleUpdateInput).handler(async ({ input }) => await svc.updateRole(input)),

  remove: base.use(withPerm('roles', 'delete')).input(z.strictObject({
    id: z.string().min(1),
  })).handler(async ({ input }) => await svc.removeRole(input)),
}
