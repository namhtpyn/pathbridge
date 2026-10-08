// FRONTEND schema — intentionally loose: accepts what input elements produce
// (undefined | null | '' | string) and TRANSFORMS into the clean payload the
// API wants. The backend strict schema still re-validates everything — this
// layer is UX + normalization only, never security.
import { z } from 'zod'

/** One header override row as the UI edits it (loose strings). */
export interface HeaderRowInput {
  name: string
  op: 'set' | 'remove'
  value: string
}

/** Raw form state — mirrors the loose UI inputs. */
export const routeFormSchema = z.object({
  path: z.string().default(''),
  target: z.string().default(''),
  requestHeaders: z.array(z.object({
    name: z.string().default(''),
    op: z.enum(['set', 'remove']).default('set'),
    value: z.string().default(''),
  })).default([]),
  responseHeaders: z.array(z.object({
    name: z.string().default(''),
    op: z.enum(['set', 'remove']).default('set'),
    value: z.string().default(''),
  })).default([]),
  note: z.string().nullish().transform(v => v?.trim() ?? ''),
  stripPrefix: z.boolean().default(false),
  enabled: z.boolean().default(true),
})

export type RouteFormState = z.input<typeof routeFormSchema>

const HOP_BY_HOP_UI = ['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'te', 'trailer', 'upgrade']

const headerRow = z.object({
  name: z.string()
    .transform(v => v.trim().toLowerCase())
    .refine(v => /^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(v), 'invalid header name')
    .refine(v => !HOP_BY_HOP_UI.includes(v), 'hop-by-hop headers cannot be overridden'),
  op: z.enum(['set', 'remove']),
  value: z.string().transform(v => v.trim()),
})

/** rows -> API list: trim/lowercase names, drop empty rows, value only for set. */
function toOverrides(rows: Array<{ name: string, op: 'set' | 'remove', value: string }>) {
  return rows
    .filter(r => r.name.trim() !== '' && (r.op === 'remove' || r.value.trim() !== ''))
    .map(r => ({
      name: r.name.trim().toLowerCase(),
      op: r.op,
      ...(r.op === 'set' ? { value: r.value.trim() } : {}),
    }))
}

/** Loose for UX checks; transforms to the strict PUT payload on submit. */
export const routeSubmitSchema = z.object({
  path: z.string()
    .transform(v => v.trim())
    .refine(v => v.startsWith('/'), 'path must start with "/"')
    .refine(v => v !== '/', 'path "/" is reserved — it redirects to the admin UI')
    .refine(v => v !== '/admin' && !v.startsWith('/admin/'), 'path must not collide with the admin UI')
    .refine(v => v !== '/auth' && !v.startsWith('/auth/') && v !== '/health' && !v.startsWith('/health/'), 'path must not collide with reserved app routes')
    .refine((v) => {
      if (!v.includes('*')) return true
      return v.endsWith('/*') && !v.slice(0, -2).endsWith('/') && !v.slice(0, -2).includes('*')
    }, 'wildcard must be a trailing "/*" (e.g. "/hook/*")'),
  target: z.string()
    .transform(v => v.trim())
    .refine(v => /^https?:\/\//i.test(v), 'target is missing http(s)://'),
  requestHeaders: z.array(headerRow).default([]).transform(toOverrides),
  responseHeaders: z.array(headerRow).default([]).transform(toOverrides),
  note: z.string().nullish()
    .transform(v => (v ?? '').trim())
    .transform(v => v === '' ? undefined : v),
  stripPrefix: z.boolean().default(false),
  enabled: z.boolean().default(true),
}).refine(
  d => !d.stripPrefix || d.path.endsWith('/*'),
  { message: 'Strip prefix needs a wildcard path — add "/*"', path: ['stripPrefix'] },
).refine(
  d => new Set(d.requestHeaders.map(o => o.name)).size === d.requestHeaders.length,
  { message: 'duplicate request header name', path: ['requestHeaders'] },
).refine(
  d => new Set(d.responseHeaders.map(o => o.name)).size === d.responseHeaders.length,
  { message: 'duplicate response header name', path: ['responseHeaders'] },
)

export type RouteSubmitInput = z.input<typeof routeSubmitSchema>
export type RouteSubmitOutput = z.output<typeof routeSubmitSchema>
