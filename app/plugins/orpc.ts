// oRPC typed client + TanStack Query utils.
// SSR: IN-PROCESS router client (createRouterClient) — SSR procedure calls
// never leave the Nitro server. (The old RPCLink-with-origin looped out
// through nginx forwarding the browser's accept: text/html, and some
// responses came back as HTML — devalue then crashed serializing the
// payload: "Cannot stringify arbitrary non-POJOs: File(text/html)".)
// Client: relative /rpc via RPCLink. `orpc` utils expose
// .queryOptions/.mutationOptions/.liveOptions per procedure — live procedures
// (AsyncIteratorObject over SSE) stream snapshots into the query cache.
import type { RouterClient } from '@orpc/server'
import { createRouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createRouterUtils } from '@orpc/tanstack-query'
import type { Router } from '~/../server/utils/orpc'
import { router, buildServerContext } from '~/../server/utils/orpc'

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const requestURL = useRequestURL()

  // SERVER: call the router directly — no HTTP hop, cookies resolved from the
  // incoming request headers in-process
  if (import.meta.server) {
    const headers = new Headers()
    for (const [k, v] of Object.entries(event?.node.req.headers ?? {})) {
      if (v === undefined) continue
      if (Array.isArray(v)) for (const item of v) headers.append(k, item)
      else headers.set(k, v)
    }
    const ssrClient: RouterClient<Router> = createRouterClient(router, {
      context: buildServerContext(headers),
    })
    const orpc = createRouterUtils(ssrClient)
    return { provide: { client: ssrClient, orpc } }
  }

  // CLIENT: relative /rpc (session cookies ride along automatically)
  const link = new RPCLink({
    url: '/rpc',
    origin: typeof window === 'undefined' ? requestURL.origin : undefined,
    headers: () => event?.headers ?? {},
  })

  const client: RouterClient<Router> = createORPCClient(link)
  const orpc = createRouterUtils(client)
  return { provide: { client, orpc } }
})
