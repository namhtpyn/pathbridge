// GET /api/auth-config — public auth capabilities for the login screen.
// Live policy from Settings/env — no caching, so Settings changes show
// on the next page load.
import { resolveAuthPolicy } from '../utils/auth'

export interface AuthConfig {
  passwordEnabled: boolean
  oidcEnabled: boolean
  /** login buttons, one per configured provider */
  providers: Array<{ id: string, label: string }>
}

export default defineEventHandler(async (): Promise<AuthConfig> => {
  const p = await resolveAuthPolicy()
  return {
    passwordEnabled: p.passwordEnabled,
    oidcEnabled: p.oidcEnabled,
    providers: p.oidcProviders.map(x => ({ id: x.id, label: x.label })),
  }
})
