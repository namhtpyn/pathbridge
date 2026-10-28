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
  // Belt for node presets. It CANNOT be the only path: on the Bun preset the
  // response is unenv's mock ServerResponse — socket is null and destroy()
  // drops the listeners without ever emitting 'close'.
  event.node.res.on('close', () => ac.abort())
  const request = new Request(toWebRequest(event), { signal: ac.signal })
  const headers = new Headers()
  request.headers.forEach((v, k) => headers.set(k, v))
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: buildCtx(headers, ac.signal),
  })
  if (!response) {
    setResponseStatus(event, 404, 'Not found')
    return 'Not found'
  }
  if (!response.body) return response
  // Load-bearing abort wiring: the adapter CANCELS the body when the client
  // disconnects (and the transform flushes when the generator completes), so
  // the abort fires on every preset. Without it `ac.abort()` never ran on Bun
  // and every SSE subscriber leaked for the process lifetime.
  // NB: `cancel` is in the Streams spec's Transformer but not in lib.dom's
  // type, hence the cast.
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    cancel: () => ac.abort(),
    flush: () => ac.abort(),
  } as Transformer<Uint8Array, Uint8Array>))
  // status/statusText/headers ride along from the original Response
  return new Response(body, response)
})
