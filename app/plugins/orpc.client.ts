// oRPC typed client — CLIENT build only.
// Relative /rpc via RPCLink (session cookies ride along automatically).
// Server-side rendering is handled by orpc.server.ts (in-process router);
// keeping this file free of server imports guarantees the browser bundle
// never pulls in bun:sqlite / node:fs.
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createRouterUtils } from '@orpc/tanstack-query'
import type { Router } from '~/../server/utils/orpc'

export default defineNuxtPlugin(() => {
  const link = new RPCLink({ url: '/rpc' })
  const client: RouterClient<Router> = createORPCClient(link)
  const orpc = createRouterUtils(client)
  return { provide: { client, orpc } }
})
