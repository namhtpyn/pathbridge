// Multi-provider OIDC registry.
// Providers live in the settings table as one JSON blob (key `oidcProviders`);
// the legacy single-provider keys (oidcIssuer/oidcClientId/oidcClientSecret)
// migrate lazily into provider id `oidc` so existing linked accounts keep working.
import { getSettings, setSetting } from './settings'

export interface OidcProvider {
  /** slug used as better-auth providerId; callback = /auth/callback/<id> */
  id: string
  /** human label shown on the login button */
  label: string
  issuer: string
  clientId: string
  /** never returned to the client; empty string allowed only in API responses */
  clientSecret: string
}

export type OidcProviderPublic = Omit<OidcProvider, 'clientSecret'> & { secretSet: boolean }

/** ids that would collide with better-auth core routes or other schemes */
const RESERVED_IDS = new Set(['email', 'credential', 'oauth2', 'callback', 'error', 'ok', 'api-key'])

export function validProviderId(id: string): boolean {
  return /^[a-z][a-z0-9-]{1,31}$/.test(id) && !RESERVED_IDS.has(id)
}

let migrated = false

export async function getOidcProviders(): Promise<OidcProvider[]> {
  const s = await getSettings()
  const raw = (s as unknown as { oidcProviders?: string }).oidcProviders
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as OidcProvider[]
      if (Array.isArray(parsed)) return parsed.filter(p => p && p.id && p.issuer && p.clientId)
    } catch { /* fall through to legacy */ }
  }
  // lazy legacy migration: single provider config -> provider id 'oidc'
  if (!migrated && s.oidcIssuer && s.oidcClientId && s.oidcClientSecret) {
    migrated = true
    const legacy: OidcProvider[] = [{ id: 'oidc', label: 'SSO', issuer: s.oidcIssuer, clientId: s.oidcClientId, clientSecret: s.oidcClientSecret }]
    await setOidcProviders(legacy)
    return legacy
  }
  return []
}

export async function setOidcProviders(list: OidcProvider[]): Promise<void> {
  await setSetting('oidcProviders', JSON.stringify(list))
}

export function providersToPublic(list: OidcProvider[]): OidcProviderPublic[] {
  return list.map(({ clientSecret, ...rest }) => ({ ...rest, secretSet: clientSecret.length > 0 }))
}
