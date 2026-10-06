export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  nitro: {
    compatibilityDate: '2026-01-01',
    experimental: { openAPI: false },
  },
  app: {
    head: {
      title: 'pathbridge',
      meta: [{ name: 'description', content: 'Path-to-URL forwarding proxy' }],
    },
  },
})
