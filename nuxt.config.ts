export default defineNuxtConfig({
  // poll for newer deployed builds (client checks builds/latest.json; app.vue shows the update banner)
  experimental: {
    checkOutdatedBuildInterval: 60_000,
    typescriptPlugin: true,
    viteEnvironmentApi: true,
    typedPages: true,
    appManifest: true,
    watcher: 'builder',
  },
  dxup: {
    features: {
      namedLayoutSlots: true,
    },
  },
  typescript: {
    typeCheck: true,
  },
  modules: ['@nuxt/ui', '@nuxt/fonts', '@nuxt/icon', '@dxup/nuxt'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-01-01',
  nitro: {
    compatibilityDate: '2026-01-01',
    experimental: { openAPI: false },
  },
  app: {
    head: {
      title: 'Pathbridge',
      meta: [{ name: 'description', content: 'Path-to-URL forwarding proxy' }],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/favicon-192.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },
})
