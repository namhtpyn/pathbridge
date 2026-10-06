// GET /api/auth-config — public auth capabilities for the login screen.
import { passwordLoginEnabled, oidcConfigured } from '../utils/auth'

export interface AuthConfig {
  passwordEnabled: boolean
  oidcEnabled: boolean
}

export default defineEventHandler(async (): Promise<AuthConfig> => ({
  passwordEnabled: passwordLoginEnabled,
  oidcEnabled: oidcConfigured,
}))
