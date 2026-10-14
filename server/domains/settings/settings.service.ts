const getDb = async () => (await import('../../db')).db
// Settings store: key/value in the `settings` table, cached in memory.
// Runtime-editable knobs that used to be env-only (OIDC config, password
// login toggle, access-log retention).
// lazy: nuxt prepare (jiti/Node) must not statically reach bun:sqlite
import { settings } from '../../db/schema'

export interface AppSettings {
  /** multi-provider registry; JSON string of OidcProvider[] (modules/oidc/oidc.service.ts) */
  oidcProviders: string
  /** legacy single-provider config; migrated lazily into oidcProviders */
  oidcIssuer: string
  oidcClientId: string
  /** write-only via API; stored plaintext (better-auth needs the real value) */
  oidcClientSecret: string
  /** when true + OIDC configured, email+password login is disabled */
  disablePasswordLogin: boolean
  /** access-log retention in days; 0 = keep forever */
  logRetentionDays: number
}

const DEFAULTS: AppSettings = {
  oidcProviders: '',
  oidcIssuer: '',
  oidcClientId: '',
  oidcClientSecret: '',
  disablePasswordLogin: false,
  logRetentionDays: 30,
}

function coerce(raw: string | undefined, key: keyof AppSettings) {
  if (raw === undefined) return undefined
  switch (key) {
    case 'disablePasswordLogin': return raw === 'true'
    case 'logRetentionDays': {
      const n = Number(raw)
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
    }
    default: return raw
  }
}

export async function getSettings() {
  const rows = await (await getDb()).query.settings.findMany()
  const out = { ...DEFAULTS }
  const KEYS = Object.keys(DEFAULTS) as Array<keyof AppSettings>
  for (const row of rows) {
    const key = KEYS.find(k => k === row.key)
    if (!key) continue
    const v = coerce(row.value, key)
    if (v !== undefined) out[key] = v
  }
  return out
}

export async function setSetting(key: keyof AppSettings, value: string | number | boolean) {
  await (await getDb()).insert(settings).values({ key, value: String(value), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(value), updatedAt: new Date().toISOString() } })
}


