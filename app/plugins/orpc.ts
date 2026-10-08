// oRPC typed client: SSR uses the router directly (no HTTP hop); client-side
// uses RPCLink against /rpc. Provided as $client (RouterClient).
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
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
  return { provide: { client } }
})
