export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/fonts', '@nuxt/icon'],
  css: ['~/assets/css/main.css'],
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
