import { readFileSync, writeFileSync } from 'node:fs'
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
    // bun preset: we run on bun + bun:sqlite — the default preset can mis-bundle
    // Bun-specific package exports (bun.com/guides/ecosystem/nuxt)
    preset: 'bun',
    experimental: { openAPI: false },
    hooks: {
      // Bun's server idleTimeout defaults to 10s and is NOT reset by stream writes,
      // so SSE live queries (15s keepalive) abort mid-stream. The preset entry reads
      // NITRO_BUN_IDLE_TIMEOUT at boot; patch the built entry so the DEFAULT is 255
      // (Bun's hard cap) even when the deploy env forgets the variable. An explicit
      // env value still wins.
      'compiled'(_nitro: { options: { output: { serverDir: string } } }) {
        const entry = `${_nitro.options.output.serverDir}/index.mjs`
        let src: string
        try { src = readFileSync(entry, 'utf8') } catch { return }
        const needle = 'idleTimeout: Number.parseInt(process.env.NITRO_BUN_IDLE_TIMEOUT) || void 0'
        if (!src.includes(needle)) {
          console.warn(`[nuxt.config] bun idleTimeout patch: pattern not found in ${entry} — nitro preset template changed?`)
          return
        }
        writeFileSync(entry, src.replace(needle,
          'idleTimeout: Number.parseInt(process.env.NITRO_BUN_IDLE_TIMEOUT) || 255'))
      },
    },
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
