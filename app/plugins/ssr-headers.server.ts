// Capture request cookies during SSR setup where the Nuxt context IS valid
// (plugins run inside it). Layouts/pages read them via useState.
export default defineNuxtPlugin(() => {
  const headers = useRequestHeaders(['cookie'])
  const state = useState<Record<string, string> | undefined>('admin:ssr-headers', () => undefined)
  state.value = headers.cookie ? { cookie: headers.cookie } : undefined
})
