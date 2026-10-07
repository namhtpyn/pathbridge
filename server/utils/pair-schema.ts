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

const validPairPath = z.string().min(1).max(512)
  .startsWith('/', 'path must start with "/"')
  .refine(p => !p.startsWith('/_'), 'path must not use reserved prefix "_"')
  .refine(p => p !== '/', 'path "/" is reserved — it redirects to the admin UI')
  .refine(p => p !== '/admin' && !p.startsWith('/admin/'), 'path must not collide with the admin UI')
  .refine(p => p !== '/auth' && !p.startsWith('/auth/') && p !== '/health' && !p.startsWith('/health/') && p !== '/mcp' && !p.startsWith('/mcp/'), 'path must not collide with reserved app routes')
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

export const pairInputSchema = z.strictObject({
  /** When present: UPDATE this row (path rename allowed). Absent: upsert by path. */
  id: z.number().int().positive().optional(),
  path: validPairPath,
  target: httpTarget,
  upstreamHost: z.string().min(1).max(253)
    .regex(/^[a-zA-Z0-9.-]+(:\d{1,5})?$/, 'upstreamHost must be host[:port]').optional(),
  stripPrefix: z.boolean().optional().default(false),
  methods: methodsSchema.optional(),
  note: z.string().max(200).optional(),
  enabled: z.boolean().optional().default(true),
}).refine(
  d => !d.stripPrefix || d.path.endsWith('/*'),
  { message: 'stripPrefix requires a wildcard path (ending in "/*")', path: ['stripPrefix'] },
)

export type StrictPairInput = z.infer<typeof pairInputSchema>
