// In-process change bus for oRPC live queries.
// Mutations (REST, MCP, oRPC — any write path) call `publishChange(resource)`;
// live-query procedures subscribe and re-emit fresh data. Single-process
// deployment (bun + sqlite) so an in-memory bus is sufficient.
import { MemoryPublisher } from '@orpc/publisher/memory'

export type ChangeEvent = {
  /** monotonically increasing id — clients resume from the last seen */
  id: string
  /** resource that changed */
  resource: 'routes' | 'users' | 'roles' | 'settings' | 'logs' | 'keys'
  action: 'create' | 'update' | 'delete'
  at: string
}

type Events = { change: ChangeEvent }

let seq = 0
export const changeBus = new MemoryPublisher<Events>({
  maxBufferedEvents: 100,
})

/** Publish a data-change event; live queries re-run and push fresh rows. */
export async function publishChange(
  resource: ChangeEvent['resource'],
  action: ChangeEvent['action'],
): Promise<void> {
  seq += 1
  await changeBus.publish('change', {
    id: `${Date.now()}-${seq}`,
    resource,
    action,
    at: new Date().toISOString(),
  })
}
