// Tiny deterministic upstream for proxy e2e: GET /echo?p=1 -> {ok:true,echo:{path,method,headers}}
// GET /anything/* -> {ok:true,path}. Binds 127.0.0.1:4311 (bun, zero deps).
const UPSTREAM_PORT = Number(process.env.E2E_UPSTREAM_PORT || 4311)
Bun.serve({
  port: UPSTREAM_PORT,
  fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/__die') return new Response('gateway simulated', { status: 502 })
    const body = {
      ok: true,
      upstream: true,
      method: req.method,
      path: url.pathname,
      query: url.search,
      headers: Object.fromEntries([...req.headers.entries()].filter(([k]) => k.startsWith('x-') || k === 'host' || k === 'cookie')),
    }
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-upstream': 'e2e' } })
  },
})
console.log(`e2e upstream on :${UPSTREAM_PORT}`)
