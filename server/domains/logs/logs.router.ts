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

  /** live tail — DELTAS ONLY; the stream carries NO initial data (AGENTS.md law:
   *  the list is loaded by the conventional logs.recent query) and needs NO
   *  payload input. lastSeen = highest own-scope row id at subscribe time; each
   *  change event pushes just the rows after it. A reconnect never re-sends a
   *  window — the client reconciles by refetching logs.recent. */
  tail: base
    .use(withPerm('logs', 'read'))
    .handler(async ({ context }) => {
      let lastId = await svc.latestLogId(context.user)
      async function* deltas() {
        const { changeBus } = await import('../../lib/change-bus')
        for await (const evt of changeBus.subscribe('change')) {
          if (evt.resource !== 'logs') continue
          const fresh = await svc.queryLogsAfter(context.user, { afterId: lastId, limit: 100 })
          if (!fresh.length) continue
          lastId = fresh.at(-1)!.id
          yield { entries: fresh }
        }
      }
      return deltas()
    }),
}
