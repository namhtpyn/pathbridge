// /rpc — oRPC Fetch API adapter (RPCHandler). Auth context built per request
// via buildServerContext (cookie session or Bearer API key, same as REST).
import { RPCHandler } from '@orpc/server/fetch'
import { router, buildServerContext } from '../../utils/orpc'

const handler = new RPCHandler(router)

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event)
  const headers = new Headers()
  request.headers.forEach((v, k) => headers.set(k, v))
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: buildServerContext(headers),
  })
  if (response) return response
  setResponseStatus(event, 404, 'Not found')
  return 'Not found'
})
