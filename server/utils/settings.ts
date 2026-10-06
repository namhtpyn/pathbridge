// Settings store: key/value in the `settings` table, cached in memory.
// Runtime-editable knobs that used to be env-only (OIDC config, password
// login toggle, access-log retention).
import { db } from '../db'
import { settings } from '../db/schema'

export interface AppSettings {
  /** OIDC issuer URL; empty = OIDC off */
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
  oidcIssuer: '',
  oidcClientId: '',
  oidcClientSecret: '',
  disablePasswordLogin: false,
  logRetentionDays: 30,
}

function coerce(raw: string | undefined, key: keyof AppSettings): string | number | boolean | undefined {
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

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.query.settings.findMany()
  const out = { ...DEFAULTS }
  for (const row of rows) {
    const v = coerce(row.value, row.key as keyof AppSettings)
    if (v !== undefined) out[row.key as keyof AppSettings] = v as never
  }
  return out
}

export async function setSetting(key: keyof AppSettings, value: string | number | boolean): Promise<void> {
  await db.insert(settings).values({ key, value: String(value), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(value), updatedAt: new Date().toISOString() } })
}


