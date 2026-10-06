<template>
  <div class="wrap">
    <header>
      <h1>pathbridge</h1>
      <p class="sub">forward selected paths to external upstreams</p>
    </header>

    <!-- login -->
    <form v-if="!session && authConfig?.passwordEnabled !== false" class="card" @submit.prevent="login">
      <h2>sign in</h2>
      <label>email
        <input v-model="email" type="email" required>
      </label>
      <label>password
        <input v-model="password" type="password" required>
      </label>
      <p v-if="loginError" class="err">{{ loginError }}</p>
      <button :disabled="busy">sign in</button>
      <button v-if="authConfig?.oidcEnabled" type="button" class="ghost" style="margin-left:.5rem" @click="oidcLogin">sign in with SSO</button>
    </form>
    <div v-else-if="!session && authConfig?.oidcEnabled" class="card">
      <h2>sign in</h2>
      <button @click="oidcLogin">sign in with SSO</button>
    </div>

    <!-- main -->
    <template v-else-if="session">
      <div class="bar">
        <span class="who">{{ session.user.name || session.user.email }}</span>
        <button class="ghost" @click="logout">sign out</button>
      </div>

      <form class="card" @submit.prevent="save">
        <h2>{{ editing ? `edit ${editing}` : 'new pair' }}</h2>
        <label>path prefix
          <input v-model="form.path" placeholder="/hook" required>
        </label>
        <label>target origin
          <input v-model="form.target" placeholder="https://api.example.com" required>
        </label>
        <label>upstream Host header <span class="opt">(optional — defaults to target hostname)</span>
          <input v-model="form.upstreamHost" placeholder="api.example.com">
        </label>
        <label>note <span class="opt">(optional)</span>
          <input v-model="form.note" placeholder="what this pair is for">
        </label>
        <div class="row">
          <label class="check">
            <input v-model="form.stripPrefix" type="checkbox"> strip prefix before forwarding
          </label>
          <span class="spacer" />
          <button type="button" class="ghost" :disabled="!editing" @click="reset">cancel</button>
          <button type="submit" :disabled="busy">{{ editing ? 'update' : 'add' }}</button>
        </div>
      </form>

      <div class="card">
        <h2>pairs</h2>
        <p v-if="!pairs.length" class="empty">no pairs yet — add one above</p>
        <table v-else>
          <thead>
            <tr><th>path</th><th>target</th><th>host header</th><th>note</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="p in pairs" :key="p.path" :class="{ off: p.enabled === false }">
              <td><code>{{ p.path }}</code></td>
              <td><code>{{ p.target }}</code></td>
              <td><code>{{ p.upstreamHost || hostOf(p.target) }}</code></td>
              <td class="note">{{ p.note || '' }}</td>
              <td class="actions">
                <button class="link" @click="edit(p)">edit</button>
                <button class="link danger" @click="remove(p)">delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PairRow, PairsResponse, PairInput } from '../../shared/types'

interface SessionUser { id: string, name?: string | null, email: string }
interface SessionPayload { user: SessionUser, session: { expiresAt: string } }
interface AuthConfig { passwordEnabled: boolean, oidcEnabled: boolean }

const email = ref('')
const password = ref('')
const loginError = ref('')
const session = ref<SessionPayload | null>(null)
const pairs = ref<PairRow[]>([])
const busy = ref(false)
const editing = ref('')
const authConfig = ref<AuthConfig | null>(null)

const emptyForm = (): PairInput => ({ path: '', target: '', upstreamHost: '', note: '', stripPrefix: false, enabled: true })
const form = reactive<PairInput>(emptyForm())

onMounted(async () => {
  try {
    authConfig.value = await $fetch<AuthConfig>('/api/auth-config')
  }
  catch { authConfig.value = { passwordEnabled: true, oidcEnabled: false } }
  try {
    const s = await $fetch<SessionPayload | null>('/_auth/get-session')
    session.value = s?.user ? s : null
    if (session.value) await load()
  }
  catch { /* not signed in */ }
})

async function login() {
  busy.value = true
  loginError.value = ''
  try {
    const res = await $fetch<SessionPayload>('/_auth/sign-in/email', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    session.value = res
    await load()
  }
  catch {
    loginError.value = 'invalid credentials'
  }
  busy.value = false
}

function oidcLogin() {
  window.location.href = '/_auth/oauth2/oidc'
}

async function logout() {
  await $fetch('/_auth/sign-out', { method: 'POST' }).catch(() => {})
  session.value = null
  pairs.value = []
}

async function load() {
  const data = await $fetch<PairsResponse>('/api/pairs')
  pairs.value = data.pairs
}

function hostOf(target: string) {
  try { return new URL(target).hostname }
  catch { return '' }
}

function edit(p: PairRow) {
  editing.value = p.path
  Object.assign(form, JSON.parse(JSON.stringify(p)) as PairInput)
}

function reset() {
  editing.value = ''
  Object.assign(form, emptyForm())
}

async function save() {
  busy.value = true
  try {
    const data = await $fetch<PairsResponse>('/api/pairs', {
      method: 'PUT',
      body: { ...form },
    })
    pairs.value = data.pairs
    reset()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    alert(err.data?.statusMessage || err.message || 'save failed')
  }
  busy.value = false
}

async function remove(p: PairRow) {
  if (!confirm(`delete ${p.path}?`)) return
  try {
    const data = await $fetch<PairsResponse>(`/api/pairs/${encodeURIComponent(p.path.slice(1))}`, { method: 'DELETE' })
    pairs.value = data.pairs
    if (editing.value === p.path) reset()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    alert(err.data?.statusMessage || err.message || 'delete failed')
  }
}
</script>

<style scoped>
.wrap { max-width: 780px; margin: 2rem auto; padding: 0 1rem; font-family: ui-sans-serif, system-ui, sans-serif; }
h1 { margin: 0; font-size: 1.4rem; }
h2 { margin: 0 0 .8rem; font-size: 1rem; }
.sub { margin: .2rem 0 1.5rem; color: #666; }
.bar { display: flex; justify-content: flex-end; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.who { color: #555; font-size: .85rem; }
.card { background: #fafafa; border: 1px solid #e2e2e2; border-radius: 8px; padding: 1rem 1.2rem; margin-bottom: 1.2rem; }
label { display: block; font-size: .8rem; color: #444; margin-bottom: .6rem; }
input { display: block; width: 100%; margin-top: .2rem; padding: .45rem .6rem; border: 1px solid #ccc; border-radius: 6px; font-size: .9rem; box-sizing: border-box; }
.row { display: flex; align-items: center; gap: .6rem; margin-top: .2rem; }
.row label.check { display: flex; align-items: center; gap: .4rem; margin: 0; font-size: .8rem; }
input[type=checkbox] { display: inline; width: auto; margin: 0; }
.spacer { flex: 1 }
button { padding: .45rem .9rem; border-radius: 6px; border: 1px solid #2b2b2b; background: #2b2b2b; color: #fff; cursor: pointer; font-size: .85rem; }
button.ghost { background: none; color: #2b2b2b; }
button.link { border: none; background: none; color: #06c; padding: 0; cursor: pointer; font-size: .8rem; }
button.link.danger { color: #c33; }
table { width: 100%; border-collapse: collapse; font-size: .85rem; }
th { text-align: left; color: #666; font-weight: 500; padding: .3rem .4rem; border-bottom: 1px solid #ddd; }
td { padding: .4rem; border-bottom: 1px solid #eee; }
code { background: #f0f0f0; padding: .1rem .3rem; border-radius: 4px; font-size: .8rem; }
tr.off td { opacity: .45; }
.note { color: #666; }
.empty { color: #999; }
.err { color: #c33; font-size: .8rem; }
.opt { color: #999; }
</style>
