// The bridge: catch-all middleware. Requests under reserved prefixes fall through
// to the Nuxt app; everything else is matched against pairs and proxied.
// Pair lookup uses RQB (drizzle relations-v2 query API).
import { proxyRequest } from 'h3'
import { db } from '../db'

const RESERVED = ['/_admin', '/_api', '/_auth', '/_health', '/api']

interface MatchedPair {
  path: string
  target: string
  upstreamHost: string | null
  stripPrefix: boolean
}

/**
 * Match a request path against a pair path.
 *   /hook    exact — equals only
 *   /hook/*  subtree — /hook or /hook/anything
 *   /        root catch-all
 */
function pairMatches(pairPath: string, reqPath: string): boolean {
  if (pairPath === '/') return true
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

  const all: MatchedPair[] = await db.query.pairs.findMany({
    where: { enabled: true },
    columns: { path: true, target: true, upstreamHost: true, stripPrefix: true },
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

  return proxyRequest(event, url, { headers })
})
