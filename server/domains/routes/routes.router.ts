// routes module router: parse -> perm -> service
import { z } from 'zod'
import { base, withUser, withPerm, liveGenerator } from '../shared/context'
import type { RouteRow } from '../../../shared/types'
import * as svc from './routes.service'

const headerOverrideInput = z.strictObject({
  name: z.string().min(1).max(128),
  op: z.enum(['set', 'remove']),
  value: z.string().max(8192).optional(),
})

const routeSaveInput = z.strictObject({
  /** present = update this row; absent = create/upsert-by-path */
  id: z.number().int().positive().optional(),
  path: z.string().min(1).max(512),
  target: z.string().min(1).max(2048),
  requestHeaders: z.array(headerOverrideInput).max(20).optional(),
  responseHeaders: z.array(headerOverrideInput).max(20).optional(),
  methods: z.array(z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])).optional(),
  note: z.string().max(200).optional(),
  enabled: z.boolean().optional().default(true),
})

export const routesRouter = {
  /** one-shot list — own-scope filtered. The INITIAL load of every routes view;
   * SSE (`.live`) only updates pages after they have loaded (AGENTS.md law) */
  list: base.use(withPerm('routes', 'read')).handler(async ({ context }) =>
    svc.listRoutes(context.user)),

  /** live list — own-scope filtered; snapshot on subscribe (reconciliation for
   * already-loaded pages) then on every routes change */
  live: base.use(withPerm('routes', 'read')).handler(({ context }) =>
    liveGenerator(['routes'], async () => svc.listRoutes(context.user)),
  ),

  count: base.use(withPerm('routes', 'read')).handler(async ({ context }) => ({ count: await svc.countRoutes(context.user) })),

  /** save (create/update/upsert, takeover-safe) */
  save: base.use(withUser).input(routeSaveInput).handler(async ({ context, input }) => {
    const { route, created } = await svc.saveRoute(context, input)
    return { route, created }
  }),

  /** remove by numeric id (preferred) or path */
  remove: base.use(withUser).input(z.strictObject({
    id: z.number().int().positive().optional(),
    path: z.string().min(1).max(512).optional(),
  })).handler(async ({ context, input }) => svc.removeRoute(context, input)),
}
