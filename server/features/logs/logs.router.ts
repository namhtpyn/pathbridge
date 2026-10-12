// logs module router
import { z } from 'zod'
import { base, withPerm, liveGenerator } from '../shared/context'
import * as svc from './logs.service'

const logsPageInput = z.strictObject({
  limit: z.number().int().min(1).max(1000).optional(),
  routeId: z.number().int().positive().optional(),
  beforeId: z.number().int().positive().optional(),
})

export const logsRouter = {
  /** snapshot query (SSR-safe; no SSE during server render) */
  recent: base
    .use(withPerm('logs', 'read'))
    .input(logsPageInput)
    .handler(async ({ context, input }) => ({ entries: await svc.queryLogsScoped(context.user, input ?? {}) })),

  /** live tail — initial batch, then fresh entries whenever logs grow */
  tail: base
    .use(withPerm('logs', 'read'))
    .input(logsPageInput)
    .handler(({ context, input }) =>
      liveGenerator(['logs'], async () => ({ entries: await svc.queryLogsScoped(context.user, input ?? {}) }))),
}
