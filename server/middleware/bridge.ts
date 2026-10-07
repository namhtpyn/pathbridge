// The bridge: catch-all middleware. Requests under reserved prefixes fall through
// to the Nuxt app; everything else is matched against pairs and proxied.
// Pair lookup uses RQB (drizzle relations-v2 query API).
import { proxyRequest } from 'h3'
import { db } from '../db'
import { recordAccess } from '../utils/access-log'

const RESERVED = ['/auth', '/health', '/api', '/admin']

interface MatchedPair {
  id: number
  path: string
  target: string
  upstreamHost: string | null
  stripPrefix: boolean
  methods: string[] | null
}

/** Match: /hook exact; /hook/* subtree. */
function pairMatches(pairPath: string, reqPath: string): boolean {
  if (pairPath.endsWith('/*')) {
    const base = pairPath.slice(0, -2) // "/hook"
    return reqPath === base || reqPath.startsWith(`${base}/`)
  }
  return reqPath === pairPath
}

/** Wildcard pairs only — strip the base prefix, keep the remainder. */
function strip(pairPath: string, reqPath: string): string {
  const base = pairPath.slice(0, -2) // "/hook"
  if (reqPath === base) return '/'
  return reqPath.slice(base.length) // keeps leading "/"
}

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0] ?? '/'

  if (RESERVED.some(r => path === r || path.startsWith(`${r}/`))) return

  // root redirects to the admin UI
  if (path === '/') return sendRedirect(event, '/admin', 302)

  const all: MatchedPair[] = await db.query.pairs.findMany({
    where: { enabled: true },
    columns: { id: true, path: true, target: true, upstreamHost: true, stripPrefix: true, methods: true },
  })

  let best: MatchedPair | null = null
  for (const p of all) {
    if (pairMatches(p.path, path)) {
      // specificity: exact > longer wildcard base > root
      const score = p.path.endsWith('/*') ? p.path.length - 2 : p.path.length + 0.5
      const bestScore = best ? (best.path.endsWith('/*') ? best.path.length - 2 : best.path.length + 0.5) : -1
      if (score > bestScore) best = p
    }
  }
  if (!best) {
    throw createError({ statusCode: 404, statusMessage: 'No pair matches this path' })
  }

  // method allowlist: null = all verbs allowed (drizzle json-mode column)
  if (best.methods && !best.methods.includes(event.method)) {
    setResponseHeader(event, 'allow', best.methods.join(', '))
    throw createError({ statusCode: 405, statusMessage: `Method ${event.method} not allowed for this pair` })
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
  const headers: Record<string, string> = {
    host: best.upstreamHost ?? upstream.hostname,
  }

  const started = Date.now()
  const clientIp = getRequestIP(event, { xForwardedFor: true })?.toString() ?? null
  const userAgent = getRequestHeader(event, 'user-agent') ?? null
  const pairId = best.id

  // wrap the response to capture status; log after headers flush
  const res = await proxyRequest(event, url, { headers })
  recordAccess({
    pairId,
    pairPath: best.path,
    method: event.method,
    path,
    status: event.node.res.statusCode,
    durationMs: Date.now() - started,
    clientIp,
    userAgent,
  })
  return res
})
