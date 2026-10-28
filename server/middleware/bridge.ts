// The bridge: catch-all middleware. Requests under reserved prefixes fall through
// to the Nuxt app; everything else is matched against routes and proxied.
// Route lookup uses RQB (drizzle relations-v2 query API); the match/strip/scoring
// math lives in lib/route-match.ts (pure, unit-tested directly).
import { proxyRequest } from 'h3'
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

  // request header overrides. `set` entries ride opts.headers (merged LAST
  // by proxyRequest, so they win over the client's own values). `remove`
  // entries must DELETE the header from the incoming event BEFORE
  // proxyRequest copies the client headers — setting undefined keeps the
  // key present and it leaks upstream as the literal string "undefined".
  for (const o of best.requestHeaders ?? []) {
    if (o.op === 'remove') delete event.node.req.headers[o.name]
  }
  const headers: Record<string, string> = {
    host: upstream.host, // hostname:port — port-less Host breaks vhost upstreams
  }
  for (const o of best.requestHeaders ?? []) {
    if (o.op === 'set' && o.value !== undefined) headers[o.name] = o.value
  }

  const started = Date.now()
  const clientIp = getRequestIP(event, { xForwardedFor: true })?.toString() ?? null
  const userAgent = getRequestHeader(event, 'user-agent') ?? null
  const routeId = best.id

  // response header overrides: sendProxy copies upstream headers onto
  // event.node.res BEFORE opts.onResponse runs — mutate there.
  const onResponse = best.responseHeaders?.length
    ? (ev: typeof event) => {
        for (const o of best.responseHeaders!) {
          if (o.op === 'remove') ev.node.res.removeHeader(o.name)
          else if (o.value !== undefined) ev.node.res.setHeader(o.name, o.value)
        }
      }
    : undefined

  // wrap the response to capture status; log after headers flush. Upstream
  // failures (502) must still hit the access log — they're the rows you
  // debug from.
  try {
    const res = await proxyRequest(event, url, { headers, ...(onResponse ? { onResponse } : {}) })
    recordAccess({
      routeId,
      routePath: best.path,
      method: event.method,
      path,
      status: event.node.res.statusCode,
      durationMs: Date.now() - started,
      clientIp,
      userAgent,
    })
    return res
  }
  catch (e) {
    recordAccess({
      routeId,
      routePath: best.path,
      method: event.method,
      path,
      status: 502,
      durationMs: Date.now() - started,
      clientIp,
      userAgent,
    })
    throw e
  }
})
