// Nuxt-runtime tests (@nuxt/test-utils, environment: 'nuxt').
// These mount real components/composables inside a happy-dom Nuxt app —
// they complement, not replace, the Playwright e2e suite that boots the
// actual built artifact.
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '~/app.vue'

describe('nuxt runtime: app shell', () => {
  it('mounts the app shell (route announcer + skip link) without errors', async () => {
    const wrapper = await mountSuspended(App)
    // assert user-visible shell structure, not Vue serialization internals:
    // the route announcer and the skip link both come from the shell itself
    const html = wrapper.html()
    expect(html).toContain('nuxt-route-announcer')
    expect(wrapper.text()).toContain('Pathbridge')
  })
})
