// routes module router: parse -> perm -> service.
// The STRICT schema (routes.schema.ts) is the oRPC contract — header charset,
// hop-by-hop, reserved-path and target rules validate AT THE EDGE; the service
// trusts the parsed value.
import { z } from 'zod'
import { base, withUser, withPerm, liveGenerator } from '../shared/context'
import { routeInputSchema } from './routes.schema'
import * as svc from './routes.service'

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
  save: base.use(withUser).input(routeInputSchema).handler(async ({ context, input }) => {
    const { route, created } = await svc.saveRoute(context, input)
    return { route, created }
  }),

  /** remove by numeric id (preferred) or path — exactly one of the two */
  remove: base.use(withUser).input(z.strictObject({
    id: z.number().int().positive().optional(),
    path: z.string().min(1).max(512).optional(),
  }).refine(i => (i.id !== undefined) !== (i.path !== undefined), { message: 'provide id or path' }))
    .handler(async ({ context, input }) => svc.removeRoute(context, input)),
}
