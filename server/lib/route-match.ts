// Pure route-matching math for the bridge — no db imports, so tests can pin it
// directly (server/middleware/bridge.ts consumes this).

export type HeaderOverride = { name: string, op: 'set' | 'remove', value?: string }

export type MatchedRoute = {
  id: number
  path: string
  target: string
  requestHeaders: HeaderOverride[] | null
  responseHeaders: HeaderOverride[] | null
  methods: string[] | null
}

/** Match: /hook exact; /hook/* subtree. */
export function routeMatches(routePath: string, reqPath: string) {
  if (routePath.endsWith('/*')) {
    const base = routePath.slice(0, -2) // "/hook"
    return reqPath === base || reqPath.startsWith(`${base}/`)
  }
  return reqPath === routePath
}

/** Wildcard routes only — strip the base prefix, keep the remainder. */
export function strip(routePath: string, reqPath: string) {
  const base = routePath.slice(0, -2) // "/hook"
  if (reqPath === base) return '/'
  return reqPath.slice(base.length) // keeps leading "/"
}

/** Specificity: exact > longer wildcard base > root. */
export function specificity(routePath: string) {
  return routePath.endsWith('/*') ? routePath.length - 2 : routePath.length + 0.5
}

/** longest-prefix-wins pick from the enabled routes. */
export function pickRoute<T extends { path: string }>(routes: T[], reqPath: string): T | null {
  let best: T | null = null
  for (const p of routes) {
    if (routeMatches(p.path, reqPath) && (!best || specificity(p.path) > specificity(best.path))) best = p
  }
  return best
}
