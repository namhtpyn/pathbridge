// oRPC typed client + TanStack Query utils.
// SSR: RPCLink with event headers; client: relative /rpc. `orpc` utils expose
// .queryOptions/.mutationOptions/.liveOptions per procedure — live procedures
// (AsyncIteratorObject over SSE) stream snapshots into the query cache.
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createRouterUtils } from '@orpc/tanstack-query'
import type { Router } from '~/../server/utils/orpc'

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const requestURL = useRequestURL()

  const link = new RPCLink({
    url: '/rpc',
    origin: typeof window === 'undefined' ? requestURL.origin : undefined,
    headers: () => event?.headers ?? {},
  })

  const client: RouterClient<Router> = createORPCClient(link)
  const orpc = createRouterUtils(client)
  return { provide: { client, orpc } }
})
