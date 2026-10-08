// The bridge: catch-all middleware. Requests under reserved prefixes fall through
// to the Nuxt app; everything else is matched against routes and proxied.
// Route lookup uses RQB (drizzle relations-v2 query API).
import { proxyRequest } from 'h3'
import { db } from '../db'
import { recordAccess } from '../utils/access-log'

const RESERVED = ['/auth', '/health', '/api', '/admin', '/mcp', '/rpc']

interface HeaderOverride { name: string, op: 'set' | 'remove', value?: string }

interface MatchedRoute {
  id: number
  path: string
  target: string
  requestHeaders: HeaderOverride[] | null
  responseHeaders: HeaderOverride[] | null
  stripPrefix: boolean
  methods: string[] | null
}

/** Match: /hook exact; /hook/* subtree. */
function routeMatches(routePath: string, reqPath: string): boolean {
  if (routePath.endsWith('/*')) {
    const base = routePath.slice(0, -2) // "/hook"
    return reqPath === base || reqPath.startsWith(`${base}/`)
  }
  return reqPath === routePath
}

/** Wildcard routes only — strip the base prefix, keep the remainder. */
function strip(routePath: string, reqPath: string): string {
  const base = routePath.slice(0, -2) // "/hook"
  if (reqPath === base) return '/'
  return reqPath.slice(base.length) // keeps leading "/"
}

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0] ?? '/'

  if (RESERVED.some(r => path === r || path.startsWith(`${r}/`))) return

  // root redirects to the admin UI
  if (path === '/') return sendRedirect(event, '/admin', 302)

  const all: MatchedRoute[] = await db.query.routes.findMany({
    where: { enabled: true },
    columns: { id: true, path: true, target: true, requestHeaders: true, responseHeaders: true, stripPrefix: true, methods: true },
  })

  let best: MatchedRoute | null = null
  for (const p of all) {
    if (routeMatches(p.path, path)) {
      // specificity: exact > longer wildcard base > root
      const score = p.path.endsWith('/*') ? p.path.length - 2 : p.path.length + 0.5
      const bestScore = best ? (best.path.endsWith('/*') ? best.path.length - 2 : best.path.length + 0.5) : -1
      if (score > bestScore) best = p
    }
  }
  if (!best) {
    throw createError({ statusCode: 404, statusMessage: 'No route matches this path' })
  }

  // method allowlist: null = all verbs allowed (drizzle json-mode column)
  if (best.methods && !best.methods.includes(event.method)) {
    setResponseHeader(event, 'allow', best.methods.join(', '))
    throw createError({ statusCode: 405, statusMessage: `Method ${event.method} not allowed for this route` })
  }

  // target may carry its own path prefix: https://upstream/base + request rest
  const target = best.target.replace(/\/+$/, '')
  let rest = path
  if (best.stripPrefix && best.path.endsWith('/*')) {
    rest = strip(best.path, path)
  }
  const qIndex = event.path.indexOf('?')
  const q = qIndex >= 0 ? event.path.slice(qIndex) : ''
  const url = `${target}${rest}${q}`

  const upstream = new URL(best.target)

  // request header overrides. `set` entries ride opts.headers (merged LAST
  // by proxyRequest, so they win over the client's own values). `remove`
  // entries must strip the header from the incoming event BEFORE
  // proxyRequest copies the client headers.
  const removeNames = (best.requestHeaders ?? []).filter(o => o.op === 'remove').map(o => o.name)
  for (const name of removeNames) {
    event.node.req.headers[name] = undefined
  }
  const headers: Record<string, string> = {
    host: upstream.hostname, // default; may be overridden below
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

  // wrap the response to capture status; log after headers flush
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
})
