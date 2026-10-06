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

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0] ?? '/'

  if (RESERVED.some(r => path === r || path.startsWith(`${r}/`))) return

  const all: MatchedPair[] = await db.query.pairs.findMany({
    where: { enabled: true },
    columns: { path: true, target: true, upstreamHost: true, stripPrefix: true },
  })

  let best: MatchedPair | null = null
  for (const p of all) {
    if (path === p.path || path.startsWith(p.path.endsWith('/') ? p.path : `${p.path}/`)) {
      if (!best || p.path.length > best.path.length) best = p
    }
  }
  if (!best) {
    throw createError({ statusCode: 404, statusMessage: 'No pair matches this path' })
  }

  const target = best.target.replace(/\/+$/, '')
  let rest = path
  if (best.stripPrefix) {
    const prefix = best.path.endsWith('/') ? best.path : `${best.path}/`
    rest = prefix === '/' ? path : path.slice(prefix.length - 1)
    if (path === best.path) rest = '/'
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
