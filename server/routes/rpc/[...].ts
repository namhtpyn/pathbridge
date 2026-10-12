// /rpc — oRPC Fetch API adapter (RPCHandler). Auth context built per request
// via buildServerContext (cookie session or Bearer API key).
import { RPCHandler } from '@orpc/server/fetch'
import { appRouter } from '../../domains/app.router'
import { buildServerContext as buildCtx } from '../../domains/shared/context'

const handler = new RPCHandler(appRouter)

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event)
  const headers = new Headers()
  request.headers.forEach((v, k) => headers.set(k, v))
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: buildCtx(headers),
  })
  if (response) return response
  setResponseStatus(event, 404, 'Not found')
  return 'Not found'
})
