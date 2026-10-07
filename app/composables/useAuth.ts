// better-auth Nuxt integration: request-scoped client
// https://better-auth.com/docs/integrations/nuxt (Approach B)
import { createAuthClient } from 'better-auth/vue'

export function useAuth() {
  const url = useRequestURL()
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  return createAuthClient({
    baseURL: `${url.origin}/auth`,
    fetchOptions: { headers },
  })
}
