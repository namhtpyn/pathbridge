const getDb = async () => (await import('../../db')).db
// Settings store: key/value in the `settings` table (read fresh every call —
// auth policy resolution depends on live values; local sqlite makes it cheap).
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

export async function getSettings() {
  const rows = await (await getDb()).query.settings.findMany({ columns: { key: true, value: true }, orderBy: { key: 'asc' } })
  const out = { ...DEFAULTS }
  for (const row of rows) {
    // dispatch on the KEY, never on the JS type of the parsed value: a second
    // boolean/numeric setting would otherwise silently overwrite the first
    const key = row.key as keyof AppSettings
    switch (key) {
      case 'oidcProviders': out.oidcProviders = row.value; break
      case 'oidcIssuer': out.oidcIssuer = row.value; break
      case 'oidcClientId': out.oidcClientId = row.value; break
      case 'oidcClientSecret': out.oidcClientSecret = row.value; break
      case 'disablePasswordLogin': out.disablePasswordLogin = row.value === 'true'; break
      case 'logRetentionDays': {
        const n = Number(row.value)
        if (Number.isFinite(n) && n >= 0) out.logRetentionDays = Math.floor(n)
        break
      }
      default: {
        // exhaustive over AppSettings at compile time; unknown keys (a setting
        // dropped from the code but still stored) are ignored
        const unhandled: never = key
        void unhandled
      }
    }
  }
  return out
}

export async function setSetting(key: keyof AppSettings, value: string | number | boolean) {
  await (await getDb()).insert(settings).values({ key, value: String(value), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(value), updatedAt: new Date().toISOString() } })
}


