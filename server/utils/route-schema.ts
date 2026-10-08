// STRICT backend validation schema — the security boundary.
// .strict() rejects unknown keys; every field bounded; refinements enforced.
//
// Path semantics:
//   /hook     exact match only
//   /hook/*   subtree: /hook and everything under it
//   /         root catch-all
// stripPrefix is only valid on wildcard paths (what would it strip otherwise?)
import { z } from 'zod'

// target: http(s) URL; a path is allowed and becomes the path prefix for
// forwarded requests. No query/hash (query strings belong to the request).
const httpTarget = z.string().min(1, 'target is required').max(2048).refine((t) => {
  try {
    const u = new URL(t)
    return (u.protocol === 'http:' || u.protocol === 'https:')
      && u.search === ''
      && u.hash === ''
  }
  catch { return false }
}, 'target must be an http(s) URL without query or fragment')

const validRoutePath = z.string().min(1).max(512)
  .startsWith('/', 'path must start with "/"')
  .refine(p => !p.startsWith('/_'), 'path must not use reserved prefix "_"')
  .refine(p => p !== '/', 'path "/" is reserved — it redirects to the admin UI')
  .refine(p => p !== '/admin' && !p.startsWith('/admin/'), 'path must not collide with the admin UI')
  .refine(p => p !== '/auth' && !p.startsWith('/auth/') && p !== '/health' && !p.startsWith('/health/') && p !== '/mcp' && !p.startsWith('/mcp/') && p !== '/rpc' && !p.startsWith('/rpc/'), 'path must not collide with reserved app routes')
  .refine((p) => {
    if (!p.includes('*')) return true
    if (!p.endsWith('/*')) return false
    const base = p.slice(0, -2)
    return base.length > 0 && !base.endsWith('/') && !base.includes('*')
  }, 'wildcard must be a trailing "/*" on a non-empty base (e.g. "/hook/*"); use "/" for the root catch-all')

const httpVerbs = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
export type HttpVerb = typeof httpVerbs[number]

export const methodsSchema = z.array(z.enum(httpVerbs))
  .min(1, 'allow at least one method')
  .refine(m => new Set(m).size === m.length, 'duplicate methods')

// ---- header overrides ------------------------------------------------------
// Semantics: applied in array order; later entries win. Names are lowercase
// (HTTP headers are case-insensitive; storage must not care).
// `host` is settable (classic Host override); framing/hop-by-hop headers are
// NOT — a wrong content-length/transfer-encoding breaks the proxied body.
export type HeaderOverride = { name: string, op: 'set' | 'remove', value?: string }

const HOP_BY_HOP = new Set(['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'upgrade'])

const headerName = z.string().min(1, 'header name is required').max(128)
  .transform(n => n.trim().toLowerCase())
  .refine(n => /^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(n), 'invalid header name')
  .refine(n => !HOP_BY_HOP.has(n), 'hop-by-hop headers (content-length, transfer-encoding, connection…) cannot be overridden')

const headerValue = z.string().max(8192, 'header value too long (max 8192)')
  .refine(v => !/[\r\n]/.test(v), 'header value must not contain newlines')

export const headerOverridesSchema = z.array(z.strictObject({
  name: headerName,
  op: z.enum(['set', 'remove']),
  value: headerValue.optional(),
}).refine(o => o.op === 'remove' || (o.value !== undefined && o.value !== ''), {
  message: 'value is required for op "set"',
  path: ['value'],
})).max(20, 'at most 20 header overrides per direction')
  .refine(list => new Set(list.map(o => o.name)).size === list.length, 'duplicate header name — merge entries instead (later entries would shadow earlier ones)')

export type HeaderOverrides = z.infer<typeof headerOverridesSchema>

export const routeInputSchema = z.strictObject({
  /** When present: UPDATE this row (path rename allowed). Absent: upsert by path. */
  id: z.number().int().positive().optional(),
  path: validRoutePath,
  target: httpTarget,
  /** Headers set/removed on the request before it reaches the upstream. */
  requestHeaders: headerOverridesSchema.optional(),
  /** Headers set/removed on the proxied response before it reaches the client. */
  responseHeaders: headerOverridesSchema.optional(),
  stripPrefix: z.boolean().optional().default(false),
  methods: methodsSchema.optional(),
  note: z.string().max(200).optional(),
  enabled: z.boolean().optional().default(true),
}).refine(
  d => !d.stripPrefix || d.path.endsWith('/*'),
  { message: 'stripPrefix requires a wildcard path (ending in "/*")', path: ['stripPrefix'] },
)

export type StrictRouteInput = z.infer<typeof routeInputSchema>

