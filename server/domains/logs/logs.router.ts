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

  /** live tail — initial window snapshot, then DELTAS (only rows newer than the
   *  last delivered id, ascending). Client prepends; the wire stays small under
   *  traffic instead of re-sending the whole window on every change. */
  tail: base
    .use(withPerm('logs', 'read'))
    .input(z.strictObject({ limit: z.number().int().min(1).max(1000).optional(), routeId: z.number().int().positive().optional() }))
    .handler(async ({ context, input }) => {
      const window = await svc.queryLogsScoped(context.user, { limit: input?.limit, routeId: input?.routeId })
      let lastId = window.length ? window[0]!.id : 0
      async function* deltas() {
        yield { entries: window, reset: true }
        const { changeBus } = await import('../../lib/change-bus')
        for await (const evt of changeBus.subscribe('change')) {
          if (evt.resource !== 'logs') continue
          const fresh = await svc.queryLogsAfter(context.user, { afterId: lastId, limit: input?.limit ?? 100 })
          if (!fresh.length) continue
          lastId = fresh[fresh.length - 1]!.id
          yield { entries: fresh, reset: false }
        }
      }
      return deltas()
    }),
}
