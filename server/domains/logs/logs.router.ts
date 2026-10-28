// logs module router
import { z } from 'zod'
import { base, withPerm, pullIterator } from '../shared/context'
import * as svc from './logs.service'

/** rows per delta page; a burst bigger than this is drained page by page */
const TAIL_PAGE = 100

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
    .handler(async ({ context, input }) => {
      const entries = await svc.queryLogsScoped(context.user, input ?? {})
      // newest id IN THE PAGE, not the table's max: the client reconciles its
      // tail cursor against this, so rows committed between the page snapshot
      // and the first tail frame are refetched instead of skipped forever
      return { entries, latestId: entries.reduce((max, e) => Math.max(max, e.id), 0) }
    }),

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
        const bus = pullIterator(changeBus.subscribe('change'), context.signal)
        try {
          for (;;) {
            const evt = await bus.next()
            if (!evt || evt.done) return
            if (evt.value.resource !== 'logs') continue
            // drain: one event can announce a burst of more than one page, so
            // keep paging from the last id instead of jumping to the newest
            for (;;) {
              const page = await svc.queryLogsAfter(context.user, { afterId: lastId, limit: TAIL_PAGE })
              if (!page.length) break
              lastId = page.at(-1)!.id
              yield { entries: page }
              if (page.length < TAIL_PAGE) break
            }
          }
        }
        finally {
          await bus.close()
        }
      }
      return deltas()
    }),
}
