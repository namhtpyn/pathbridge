// TanStack Query for Vue + Nuxt SSR (tanstack.com/query/vue/guides/ssr):
// server prefetch -> dehydrate into the nuxt payload -> hydrate on the client,
// so first paint comes from the SERVER render and the client does not refetch
// fresh queries (staleness measured from the server fetch time).
import { VueQueryPlugin, QueryClient, hydrate, dehydrate } from '@tanstack/vue-query'
import type { DehydratedState, VueQueryPluginOptions } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxtApp) => {
  const vueQueryState = useState<DehydratedState | null>('vue-query')
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, retry: 1 },
    },
  })
  const options: VueQueryPluginOptions = { queryClient }
  nuxtApp.vueApp.use(VueQueryPlugin, options)

  if (import.meta.server) {
    nuxtApp.hooks.hook('app:rendered', () => {
      vueQueryState.value = dehydrate(queryClient)
    })
  }

  if (import.meta.client && vueQueryState.value !== null) {
    hydrate(queryClient, vueQueryState.value)
  }
})
