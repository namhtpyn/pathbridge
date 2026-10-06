// FRONTEND schema — intentionally loose: accepts what input elements produce
// (undefined | null | '' | string) and TRANSFORMS into the clean payload the
// API wants. The backend strict schema still re-validates everything — this
// layer is UX + normalization only, never security.
import { z } from 'zod'

/** Raw form state — mirrors the loose UI inputs. */
export const pairFormSchema = z.object({
  path: z.string().default(''),
  target: z.string().default(''),
  upstreamHost: z.string().nullish().transform(v => v?.trim() ?? ''),
  note: z.string().nullish().transform(v => v?.trim() ?? ''),
  stripPrefix: z.boolean().default(false),
  enabled: z.boolean().default(true),
})

export type PairFormState = z.input<typeof pairFormSchema>

/** Loose for UX checks; transforms to the strict PUT payload on submit. */
export const pairSubmitSchema = z.object({
  path: z.string()
    .transform(v => v.trim())
    .refine(v => v.startsWith('/'), 'path must start with "/"')
    .refine(v => v !== '/', 'path "/" is reserved — it redirects to the admin UI')
    .refine(v => v !== '/admin' && !v.startsWith('/admin/'), 'path must not collide with the admin UI')
    .refine((v) => {
      if (!v.includes('*')) return true
      return v.endsWith('/*') && !v.slice(0, -2).endsWith('/') && !v.slice(0, -2).includes('*')
    }, 'wildcard must be a trailing "/*" (e.g. "/hook/*")'),
  target: z.string()
    .transform(v => v.trim())
    .refine(v => /^https?:\/\//i.test(v), 'target is missing http(s)://'),
  upstreamHost: z.string().nullish()
    .transform(v => (v ?? '').trim())
    .transform(v => v === '' ? undefined : v),
  note: z.string().nullish()
    .transform(v => (v ?? '').trim())
    .transform(v => v === '' ? undefined : v),
  stripPrefix: z.boolean().default(false),
  enabled: z.boolean().default(true),
}).refine(
  d => !d.stripPrefix || d.path.endsWith('/*'),
  { message: 'Strip prefix needs a wildcard path — add "/*"', path: ['stripPrefix'] },
)

export type PairSubmitInput = z.input<typeof pairSubmitSchema>
export type PairSubmitOutput = z.output<typeof pairSubmitSchema>
