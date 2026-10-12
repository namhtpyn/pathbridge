// oRPC typed client — SERVER build only.
// SSR procedure calls run IN-PROCESS via createRouterClient: no HTTP hop,
// cookies resolved from the incoming request headers. (The old
// RPCLink-with-origin looped out through nginx forwarding the browser's
// accept: text/html — HTML responses crashed devalue serialization.)
// This file must NEVER be compiled into the client bundle: it statically
// imports the server router (-> server/db -> bun:sqlite + node:fs). A
// .server plugin is stripped from the client build by Nuxt, keeping the
// client chunk free of server-only code (hydration crash if it leaks).
import type { RouterClient } from '@orpc/server'
import { createRouterClient } from '@orpc/server'
import { createRouterUtils } from '@orpc/tanstack-query'
import type { Router } from '~/../server/domains/app.router'
import { appRouter } from '~/../server/domains/app.router'
import { buildServerContext } from '~/../server/domains/shared/context'

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()

  const headers = new Headers()
  for (const [k, v] of Object.entries(event?.node.req.headers ?? {})) {
    if (v === undefined) continue
    if (Array.isArray(v)) for (const item of v) headers.append(k, item)
    else headers.set(k, v)
  }

  const ssrClient: RouterClient<Router> = createRouterClient(appRouter, {
    context: buildServerContext(headers),
  })
  const orpc = createRouterUtils(ssrClient)
  return { provide: { client: ssrClient, orpc } }
})
