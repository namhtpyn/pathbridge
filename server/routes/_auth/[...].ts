// Mount better-auth under /_auth/* — basePath is /_auth in the auth config,
// so the handler expects the FULL original path; no rewriting needed.
import type { H3Event } from 'h3'
import { auth } from '../../utils/auth'

function headerValue(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v[0] : v
}

function buildIncomingRequest(event: H3Event, body: ArrayBuffer | undefined): Request {
  const headers = event.node.req.headers
  const host = headers.host ?? 'localhost'
  const proto = headerValue(headers['x-forwarded-proto']) ?? 'http'
  const full = event.node.req.url ?? '/'

  const method = event.method
  const hasBody = method !== 'GET' && method !== 'HEAD' && body !== undefined && body.byteLength > 0
  return new Request(`${proto}://${host}${full}`, {
    method,
    headers: new Headers(Object.entries(headers).flatMap(([k, v]) =>
      v === undefined ? [] : Array.isArray(v) ? v.map(item => [k, item] as [string, string]) : [[k, v] as [string, string]],
    )),
    body: hasBody ? body : undefined,
    // duplex is required by undici when sending request bodies
    ...(hasBody ? { duplex: 'half' as const } : {}),
  })
}

export default defineEventHandler(async (event) => {
  const raw = event.method !== 'GET' && event.method !== 'HEAD'
    ? await readRawBody(event, false)
    : undefined

  let body: ArrayBuffer | undefined
  if (raw) {
    body = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
  }

  const res = await auth.handler(buildIncomingRequest(event, body))

  res.headers.forEach((v, k) => setResponseHeader(event, k, v))
  setResponseStatus(event, res.status)
  if (res.body) {
    return new Uint8Array(await res.arrayBuffer())
  }
  return null
})
