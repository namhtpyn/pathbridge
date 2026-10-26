// Drizzle rc (Relations v2). AUTH TABLES = the better-auth CLI's generated
// schema (server/db/schema.auth.ts), imported & re-exported — the
// gen file is the single source of truth, this file only adds app tables
// (routes, settings, access_log, roles) + relations. Regen: `bun run auth:schema`
// (NO --adapter flag — it swaps the CLI to the v1 generator).
// Legacy data: prod rows stored epoch seconds; migration 20261011120000_auth_timestamp_ms
// converts them to ms and drops the legacy apikey.user_id column.
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { defineRelations } from 'drizzle-orm'

// AUTH TABLES: single source of truth = the better-auth CLI's generated schema
// (server/db/schema.auth.ts, relations-v2 output; regen via
// `bun run auth:schema` — NEVER pass --adapter on the CLI, it swaps in the v1
// generator). This file adds ONLY app tables + relations around the generated ones.
import { user, session, account, verification, apikey } from './schema.auth'

export { user, session, account, verification, apikey }
// legacy alias: pre-gen consumers import `apiKey`
export { apikey as apiKey }

export const routes = sqliteTable('routes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  target: text('target').notNull(),
  /** [{name, op: 'set'|'remove', value?}] applied to the request before forwarding. */
  requestHeaders: text('request_headers', { mode: 'json' }).$type<Array<{ name: string, op: 'set' | 'remove', value?: string }>>(),
  /** [{name, op: 'set'|'remove', value?}] applied to the proxied response. */
  responseHeaders: text('response_headers', { mode: 'json' }).$type<Array<{ name: string, op: 'set' | 'remove', value?: string }>>(),
  methods: text('methods', { mode: 'json' }).$type<string[]>(), // allowed HTTP verbs; null = all
  note: text('note'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  userId: text('user_id'),
})

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  statements: text('statements', { mode: 'json' }).$type<Record<string, string[]>>().notNull(),
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})
export const accessLog = sqliteTable('access_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: text('ts').notNull().$defaultFn(() => new Date().toISOString()),
  routeId: integer('route_id'),
  routePath: text('route_path'),
  method: text('method').notNull(),
  path: text('path').notNull(),
  status: integer('status').notNull(),
  durationMs: integer('duration_ms').notNull().default(0),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
})

// Relations v2 (drizzle rc) — the shape better-auth's relations-v2 adapter consumes
// via db._.relations and db.query.
export const relations = defineRelations(
  { user, session, account, verification, routes, settings, accessLog, apikey, roles },
  (helpers) => ({
    user: {
      sessions: helpers.many.session({ from: helpers.user.id, to: helpers.session.userId }),
      accounts: helpers.many.account({ from: helpers.user.id, to: helpers.account.userId }),
      apikeys: helpers.many.apikey({ from: helpers.user.id, to: helpers.apikey.referenceId }),
    },
    session: {
      user: helpers.one.user({ from: helpers.session.userId, to: helpers.user.id }),
    },
    account: {
      user: helpers.one.user({ from: helpers.account.userId, to: helpers.user.id }),
    },
    verification: {},
    routes: {},
    settings: {},
    accessLog: {},
    roles: {},
    apikey: {
      // plugin canonical link: apikey.referenceId -> user.id (NOT the legacy user_id column)
      user: helpers.one.user({ from: helpers.apikey.referenceId, to: helpers.user.id }),
    },
  }),
)

// tables the better-auth relations-v2 adapter consumes
export const authSchema = {
  user,
  session,
  account,
  verification,
  apikey,
}

// ---- inferred row types (single source of truth for app code) ----
export type User = typeof user.$inferSelect
export type Session = typeof session.$inferSelect
export type Account = typeof account.$inferSelect
export type Verification = typeof verification.$inferSelect
export type Route = typeof routes.$inferSelect
export type NewPair = typeof routes.$inferInsert
