// STRICT backend validation schema — the security boundary.
// .strict() rejects unknown keys; every field bounded; refinements enforced.
import { z } from 'zod'

const httpOrigin = z.string().min(1, 'target is required').max(2048).refine((t) => {
  try {
    const u = new URL(t)
    return (u.protocol === 'http:' || u.protocol === 'https:')
      && (u.pathname === '/' || u.pathname === '')
      && u.hash === ''
  }
  catch { return false }
}, 'target must be an http(s) origin only (no path)')

export const pairInputSchema = z.strictObject({
  path: z.string().min(1).max(512)
    .startsWith('/', 'path must start with "/"')
    .refine(p => !p.startsWith('/_'), 'path must not use reserved prefix "_"'),
  target: httpOrigin,
  upstreamHost: z.string().min(1).max(253)
    .regex(/^[a-zA-Z0-9.-]+(:\d{1,5})?$/, 'upstreamHost must be host[:port]').optional(),
  stripPrefix: z.boolean().optional().default(false),
  note: z.string().max(200).optional(),
  enabled: z.boolean().optional().default(true),
})

export type StrictPairInput = z.infer<typeof pairInputSchema>
