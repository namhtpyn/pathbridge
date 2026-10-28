// The bridge: catch-all middleware. Requests under reserved prefixes fall through
// to the Nuxt app; everything else is matched against routes and proxied.
// Route lookup uses RQB (drizzle relations-v2 query API); the match/strip/scoring
// math lives in lib/route-match.ts (pure, unit-tested directly).
import { getProxyRequestHeaders, getRequestWebStream } from 'h3'
import { db } from '../db'
import { recordAccess } from '../domains/logs/access-log.service'
import { pickRoute, strip, type MatchedRoute } from '../lib/route-match'

const RESERVED = ['/auth', '/health', '/api', '/admin', '/mcp', '/rpc']

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0] ?? '/'

  if (RESERVED.some(r => path === r || path.startsWith(`${r}/`))) return

  // root redirects to the admin UI
  if (path === '/') return sendRedirect(event, '/admin', 302)

  const all: MatchedRoute[] = await db.query.routes.findMany({
    where: { enabled: true },
    columns: { id: true, path: true, target: true, requestHeaders: true, responseHeaders: true, methods: true },
  })

  const best = pickRoute(all, path)
  if (!best) {
    throw createError({ statusCode: 404, statusMessage: 'No route matches this path' })
  }

  // method allowlist: null = all verbs allowed (drizzle json-mode column)
  if (best.methods && !best.methods.includes(event.method)) {
    setResponseHeader(event, 'allow', best.methods.join(', '))
    throw createError({ statusCode: 405, statusMessage: `Method ${event.method} not allowed for this route` })
  }

  // EXACT routes forward to the target VERBATIM — the configured target URL
  // (path included) IS the destination; the route path only selects the route.
  // WILDCARD routes append the remainder after their base. Query strings ride
  // along in both modes.
  const target = best.target.replace(/\/+$/, '')
  const qIndex = event.path.indexOf('?')
  const q = qIndex >= 0 ? event.path.slice(qIndex) : ''
  let url: string
  if (best.path.endsWith('/*')) {
    url = `${target}${strip(best.path, path)}${q}`
  } else {
    url = `${target}${q}`
  }

  const upstream = new URL(best.target)

  // capture BOTH before the remove-override loop below: a route that removes
  // user-agent/x-forwarded-for would otherwise log the wrong client values
  const clientIp = getRequestIP(event, { xForwardedFor: true })?.toString() ?? null
  const userAgent = getRequestHeader(event, 'user-agent') ?? null

  // Outgoing request headers: the client's own (h3's proxy view already drops
  // hop-by-hop names), minus the route's `remove` entries, plus its `set`
  // entries applied LAST so an override always wins over the client's value.
  // A deleted header is gone for real — `set(name, undefined)` used to leak
  // upstream as the literal string "undefined".
  const headers = new Headers(getProxyRequestHeaders(event))
  for (const o of best.requestHeaders ?? []) {
    if (o.op === 'remove') headers.delete(o.name)
  }
  // hostname:port — port-less Host breaks vhost upstreams
  headers.set('host', upstream.host)
  for (const o of best.requestHeaders ?? []) {
    if (o.op === 'set' && o.value !== undefined) headers.set(o.name, o.value)
  }

  const started = Date.now()
  const routeId = best.id
  const logStatus = (status: number) => recordAccess({
    routeId,
    routePath: best.path,
    method: event.method,
    path,
    status,
    durationMs: Date.now() - started,
    clientIp,
    userAgent,
  })

  // Streaming proxy instead of proxyRequest: that writes the upstream body into
  // the node response chunk by chunk, which on the Bun preset (unenv mock res)
  // buffers the WHOLE body in _data before anything reaches the client, so
  // streaming upstreams never flush and memory scales with body × concurrency.
  // A plain fetch + web Response hands the platform stream to the adapter.
  const ac = new AbortController()
  // belt for node presets: a disconnected client closes the response (the Bun
  // preset's mock res never emits 'close' — its socket is null)
  event.node.res.on('close', () => ac.abort())
  event.node.req.on('aborted', () => ac.abort())

  // stream uploads straight through instead of readRawBody() buffering them
  const reqBody = getRequestWebStream(event)

  try {
    const upstreamRes = await fetch(url, {
      method: event.method,
      headers,
      body: reqBody,
      signal: ac.signal,
      ...(reqBody ? { duplex: 'half' } : {}),
    } as RequestInit)

    // fetch hands us a DECODED payload, so the upstream's framing headers
    // would lie to the client (sendProxy drops the same two)
    const resHeaders = new Headers(upstreamRes.headers)
    resHeaders.delete('content-length')
    resHeaders.delete('content-encoding')
    resHeaders.delete('transfer-encoding')
    for (const o of best.responseHeaders ?? []) {
      if (o.op === 'remove') resHeaders.delete(o.name)
      else if (o.value !== undefined) resHeaders.set(o.name, o.value)
    }

    const status = upstreamRes.status
    // headers are in; the body streams after this row (upstream failures 502
    // and client hangs-ups 499 are logged in the catch below)
    logStatus(status)
    const statusText = upstreamRes.statusText
    if (!upstreamRes.body) return new Response(null, { status, statusText, headers: resHeaders })

    // cancel/flush fire on the CONSUMER side, so a dropped client aborts the
    // upstream fetch even where a response 'close' event never fires
    const body = upstreamRes.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      cancel: () => ac.abort(),
      flush: () => ac.abort(),
    } as Transformer<Uint8Array, Uint8Array>))
    return new Response(body, { status, statusText, headers: resHeaders })
  }
  catch (e) {
    // a client that hung up mid-proxy is not an upstream failure: log nginx's
    // 499 so the two are distinguishable in the access log (the row is kept).
    const err = e as { name?: string } | null
    const clientGone = ac.signal.aborted || event.node.req.aborted === true || err?.name === 'AbortError'
    logStatus(clientGone ? 499 : 502)
    if (!clientGone) {
      console.error(`[bridge] upstream failed: ${url}`, e)
    }
    throw clientGone
      ? createError({ statusCode: 499, statusMessage: 'Client Closed Request' })
      : createError({ statusCode: 502, statusMessage: 'Bad Gateway', cause: e })
  }
})
