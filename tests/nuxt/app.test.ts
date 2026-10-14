// Nuxt-runtime tests (@nuxt/test-utils, environment: 'nuxt').
// These mount real components/composables inside a happy-dom Nuxt app —
// they complement, not replace, the Playwright e2e suite that boots the
// actual built artifact.
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '~/app.vue'

describe('nuxt runtime: app shell', () => {
  it('mounts the app shell (UApp + layouts + teleport anchors) without errors', async () => {
    const wrapper = await mountSuspended(App)
    // mountSuspended renders the component tree, not the SSR __nuxt shell —
    // assert on observable structure: teleport anchors + no thrown render error
    expect(wrapper.html()).toContain('teleport start')
  })
})
