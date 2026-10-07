// MCP tool handlers — thin wrappers over the SAME logic the REST API uses
// (shared zod schemas, same permission enforcement via requireUser on a
// synthetic event). A tool call is exactly as privileged as the API key
// (or session) that authenticated the MCP connection: key statements are
// intersected with the owner's role grants in requireUser — no MCP-specific
// permission logic exists here.
import type { H3Event } from 'h3'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { pairs } from '../../db/schema'
import { pairInputSchema } from '../pair-schema'
import { requireUser, userCan, requireRecordPermission } from '../permissions'
import type { PairRow } from '../../../shared/types'

/** Build a minimal H3 event so permission helpers resolve auth from headers. */
export function eventFor(headers: Headers): H3Event {
  // h3 v1: node req + headers; the permission path only reads
  // event.node.req.headers — synthesize exactly that surface.
  const raw: Record<string, string | string[]> = {}
  headers.forEach((v, k) => { raw[k] = v })
  return {
    node: { req: { headers: raw } },
  } as unknown as H3Event
}

async function listPairs(): Promise<PairRow[]> {
  return await db.query.pairs.findMany({ orderBy: { path: 'asc' } }) as unknown as PairRow[]
}

// pairInputSchema carries refinements (stripPrefix/wildcard) so .omit() is
// illegal on it (zod v4) — declare the create shape explicitly instead.
const pairBase = {
  path: z.string().min(1).max(512).describe('URL path prefix to claim, e.g. /hook or /hook/* (trailing wildcard)'),
  target: z.string().min(1).max(2048).describe('http(s) upstream URL (origin, optionally with base path)'),
  upstreamHost: z.string().min(1).max(253).optional().describe('Override Host header sent upstream; defaults to target hostname'),
  stripPrefix: z.boolean().optional().describe('Strip the pair prefix before forwarding (wildcard paths only)'),
  methods: z.array(z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])).optional().describe('Allowed HTTP methods; all when omitted'),
  note: z.string().max(200).optional().describe('Free-form label'),
  enabled: z.boolean().optional().describe('false parks the pair'),
}

export const mcpSchemas = {
  createPair: z.strictObject(pairBase),
  updatePair: z.strictObject({ id: z.number().int().positive().describe('Numeric pair id to update'), ...pairBase }),
  deletePair: z.strictObject({ id: z.number().int().positive().optional(), path: z.string().min(1).max(512).optional() }),
  getLogs: z.strictObject({ limit: z.number().int().min(1).max(1000).optional(), pairId: z.number().int().positive().optional() }),
}

export async function toolListPairs(headers: Headers) {
  const { user } = await requireUser(eventFor(headers))
  if (!userCan(user, 'pairs', 'read')) throw new Error('Forbidden: missing permission pairs:read')
  const all = await listPairs()
  // read:all sees everything; read:own only their pairs
  const grants = user.grants.get('pairs') ?? new Set<string>()
  if (grants.has('read:all')) return { pairs: all }
  return { pairs: all.filter(p => p.userId === user.userId) }
}

export async function toolUpsertPair(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.createPair.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid pair payload')
  const strict = pairInputSchema.safeParse(parsed.data) // security boundary: same rules as REST
  if (!strict.success) throw new Error(strict.error.issues[0]?.message ?? 'invalid pair payload')
  const { user } = await requireUser(eventFor(headers))
  const data = strict.data

  // upsert-by-path semantics identical to PUT /api/pairs
  const existing = await db.query.pairs.findFirst({ where: { path: data.path } })
  if (existing) {
    await requireRecordPermission(eventFor(headers), 'pairs', 'update', existing)
    const u = new URL(data.target)
    const targetUrl = u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')
    await db.update(pairs).set({
      target: targetUrl,
      upstreamHost: data.upstreamHost ?? null,
      stripPrefix: data.stripPrefix,
      methods: data.methods ?? null,
      note: data.note !== undefined ? data.note.slice(0, 200) : null,
      enabled: data.enabled,
      updatedAt: new Date().toISOString(),
    }).where(eq(pairs.id, existing.id))
    return { pair: await db.query.pairs.findFirst({ where: { id: existing.id } }) }
  }
  if (!userCan(user, 'pairs', 'create')) throw new Error('Forbidden: missing permission pairs:create')
  const u = new URL(data.target)
  const targetUrl = u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')
  const created = await db.insert(pairs).values({
    path: data.path,
    target: targetUrl,
    upstreamHost: data.upstreamHost ?? null,
    stripPrefix: data.stripPrefix,
    methods: data.methods ?? null,
    note: data.note !== undefined ? data.note.slice(0, 200) : null,
    enabled: data.enabled,
    userId: user.userId,
    updatedAt: new Date().toISOString(),
  }).onConflictDoUpdate({ target: pairs.path, set: { target: targetUrl, updatedAt: new Date().toISOString() } }).returning()
  return { pair: created[0] ?? await db.query.pairs.findFirst({ where: { path: data.path } }) }
}

export async function toolUpdatePairById(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.updatePair.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid pair payload')
  if (!parsed.data.id) throw new Error('id is required for update')
  const strict = pairInputSchema.safeParse(parsed.data)
  if (!strict.success) throw new Error(strict.error.issues[0]?.message ?? 'invalid pair payload')
  const { user } = await requireUser(eventFor(headers))
  const data = strict.data
  const existing = await db.query.pairs.findFirst({ where: { id: data.id } })
  if (!existing) throw new Error('pair not found')
  await requireRecordPermission(eventFor(headers), 'pairs', 'update', existing)
  const clash = await db.query.pairs.findFirst({ where: { AND: [{ path: data.path }, { id: { ne: data.id } }] }, columns: { id: true } })
  if (clash) throw new Error(`a pair already exists at ${data.path}`)
  const u = new URL(data.target)
  const targetUrl = u.pathname === '/' ? u.origin : `${u.origin}${u.pathname}`.replace(/\/+$/, '')
  await db.update(pairs).set({
    path: data.path,
    target: targetUrl,
    upstreamHost: data.upstreamHost ?? null,
    stripPrefix: data.stripPrefix,
    methods: data.methods ?? null,
    note: data.note !== undefined ? data.note.slice(0, 200) : null,
    enabled: data.enabled,
    updatedAt: new Date().toISOString(),
  }).where(eq(pairs.id, data.id))
  return { pair: await db.query.pairs.findFirst({ where: { id: data.id } }) }
}

export async function toolDeletePair(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.deletePair.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid delete payload')
  const target = parsed.data.id
    ? await db.query.pairs.findFirst({ where: { id: parsed.data.id } })
    : parsed.data.path
      ? await db.query.pairs.findFirst({ where: { OR: [{ path: parsed.data.path }, { path: `/${parsed.data.path.replace(/^\//, '')}` }] } })
      : null
  if (!target) throw new Error('pair not found')
  await requireRecordPermission(eventFor(headers), 'pairs', 'delete', target)
  await db.delete(pairs).where(eq(pairs.id, target.id))
  return { deleted: true, id: target.id, path: target.path }
}

export async function toolGetLogs(headers: Headers, input: unknown) {
  const parsed = mcpSchemas.getLogs.safeParse(input ?? {})
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid logs payload')
  const { user } = await requireUser(eventFor(headers))
  const grants = user.grants.get('logs') ?? new Set<string>()
  if (!grants.has('read:all') && !grants.has('read:own')) throw new Error('Forbidden: missing permission logs:read')

  const { queryAccessLog } = await import('../access-log')
  const limit = parsed.data.limit ?? 100
  const pairId = parsed.data.pairId

  if (grants.has('read:all')) {
    return { entries: await queryAccessLog({ limit, pairId }) }
  }
  // read:own — only logs for pairs the caller owns
  const own = await db.query.pairs.findMany({ where: { userId: user.userId }, columns: { id: true } })
  const ownIds = new Set(own.map(p => p.id))
  if (pairId !== undefined && !ownIds.has(pairId)) return { entries: [] }
  const entries = []
  for (const pid of ownIds) entries.push(...await queryAccessLog({ limit, pairId: pid }))
  entries.sort((a, b) => b.id - a.id)
  return { entries: entries.slice(0, limit) }
}
