// Drizzle rc (Relations v2): tables + relations. Auth tables are the better-auth
// canonical set (Date fields = integer timestamp mode); `pairs` is pathbridge's own.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { defineRelations } from 'drizzle-orm'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(true),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  role: text('role').notNull().default('viewer'),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})


// runtime roles: name + statement set (subset of the static ac vocabulary)
export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  statements: text('statements', { mode: 'json' }).$type<Record<string, string[]>>().notNull(),
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// @better-auth/api-key plugin table (plugin owns these writes)
export const apiKey = sqliteTable('apikey', {
  id: text('id').primaryKey(),
  name: text('name'),
  start: text('start'),
  configId: text('config_id').notNull().default('default'),
  requestCount: integer('request_count').notNull().default(0),
  prefix: text('prefix'),
  key: text('key').notNull(),
  userId: text('user_id'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  lastRequest: integer('last_request', { mode: 'timestamp' }),
  referenceId: text('reference_id').notNull(),
  lastRefillAt: integer('last_refill_at', { mode: 'timestamp' }),
  rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' }),
  rateLimitTimeWindow: integer('rate_limit_time_window'),
  rateLimitMax: integer('rate_limit_max'),
  remaining: integer('remaining'),
  refillAmount: integer('refill_amount'),
  refillInterval: integer('refill_interval'),
  metadata: text('metadata', { mode: 'json' }),
  permissions: text('permissions', { mode: 'json' }),
})

// pathbridge's own tables (ISO strings here — our code owns these writes)
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const accessLog = sqliteTable('access_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: text('ts').notNull().$defaultFn(() => new Date().toISOString()),
  pairId: integer('pair_id'),
  pairPath: text('pair_path'),
  method: text('method').notNull(),
  path: text('path').notNull(),
  status: integer('status').notNull(),
  durationMs: integer('duration_ms').notNull().default(0),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
})

export const pairs = sqliteTable('pairs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  target: text('target').notNull(),
  upstreamHost: text('upstream_host'),
  stripPrefix: integer('strip_prefix', { mode: 'boolean' }).notNull().default(false),
  methods: text('methods', { mode: 'json' }).$type<string[]>(), // allowed HTTP verbs; null = all
  note: text('note'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  userId: text('user_id'),
})

// Relations v2 (drizzle rc) — the shape better-auth's relations-v2 adapter consumes
// via db._.relations and db.query.
export const relations = defineRelations(
  { user, session, account, verification, pairs, settings, accessLog, apikey: apiKey, roles },
  (helpers) => ({
    user: {
      sessions: helpers.many.session({ from: helpers.user.id, to: helpers.session.userId }),
      accounts: helpers.many.account({ from: helpers.user.id, to: helpers.account.userId }),
    },
    session: {
      user: helpers.one.user({ from: helpers.session.userId, to: helpers.user.id }),
    },
    account: {
      user: helpers.one.user({ from: helpers.account.userId, to: helpers.user.id }),
    },
    verification: {},
    pairs: {},
    settings: {},
    accessLog: {},
    roles: {},
    apiKey: {},
  }),
)

// tables the better-auth relations-v2 adapter consumes
export const authSchema = {
  user,
  session,
  account,
  verification,
  apikey: apiKey,
}

// ---- inferred row types (single source of truth for app code) ----
export type User = typeof user.$inferSelect
export type Session = typeof session.$inferSelect
export type Account = typeof account.$inferSelect
export type Verification = typeof verification.$inferSelect
export type Pair = typeof pairs.$inferSelect
export type NewPair = typeof pairs.$inferInsert
