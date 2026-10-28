// /rpc — oRPC Fetch API adapter (RPCHandler). Auth context built per request
// via buildServerContext (cookie session or Bearer API key).
import { RPCHandler } from '@orpc/server/fetch'
import { appRouter } from '../../domains/app.router'
import { buildServerContext as buildCtx } from '../../domains/shared/context'

const handler = new RPCHandler(appRouter)

export default defineEventHandler(async (event) => {
  // Tie the procedure to the connection: oRPC hands `request.signal` to every
  // handler, so live (SSE) generators can stop when the client goes away. A
  // never-aborted signal left each disconnected tail subscribed to the change
  // bus (re-querying on every event) for the lifetime of the process.
  const ac = new AbortController()
  event.node.res.on('close', () => ac.abort())
  const request = new Request(toWebRequest(event), { signal: ac.signal })
  const headers = new Headers()
  request.headers.forEach((v, k) => headers.set(k, v))
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: buildCtx(headers, ac.signal),
  })
  if (response) return response
  setResponseStatus(event, 404, 'Not found')
  return 'Not found'
})
