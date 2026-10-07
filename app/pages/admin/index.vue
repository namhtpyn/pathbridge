<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-950">
    <!-- ===================== LOGIN ===================== -->
    <div v-if="!session" class="flex min-h-screen items-center justify-center p-6">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-2 text-center">
          <div class="flex size-12 items-center justify-center rounded-2xl bg-primary shadow-sm">
            <UIcon name="i-lucide-arrow-left-right" class="size-6 text-inverted" />
          </div>
          <h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">pathbridge</h1>
          <p class="text-sm text-zinc-500">Path forwarding for external upstreams</p>
        </div>

        <UCard :ui="{ root: 'shadow-sm' }">
          <UForm v-if="authConfig?.passwordEnabled !== false" :state="loginState" class="space-y-4" @submit="login">
            <UFormField label="Email" name="email">
              <UInput v-model="loginState.email" type="email" icon="i-lucide-mail" placeholder="you@example.com" class="w-full" size="lg" required />
            </UFormField>
            <UFormField label="Password" name="password">
              <UInput v-model="loginState.password" type="password" icon="i-lucide-lock" class="w-full" size="lg" required />
            </UFormField>
            <UAlert v-if="loginError" icon="i-lucide-shield-alert" color="error" variant="subtle" :title="loginError" />
            <UButton type="submit" block size="lg" :loading="busy" label="Sign in" />
          </UForm>
          <UButton v-if="authConfig?.oidcEnabled" block size="lg" variant="outline" icon="i-lucide-key-round" label="Sign in with SSO" class="mt-3" @click="oidcLogin" />
        </UCard>
      </div>
    </div>

    <!-- ===================== APP ===================== -->
    <div v-else class="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 sm:px-6">
      <!-- top bar -->
      <header class="flex h-14 shrink-0 items-center justify-between gap-3 sm:h-16 sm:gap-4">
        <div class="flex items-center gap-3">
          <div class="flex size-9 items-center justify-center rounded-xl bg-primary/10">
            <UIcon name="i-lucide-arrow-left-right" class="size-5 text-primary" />
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-semibold leading-tight text-zinc-900 dark:text-white">pathbridge</span>
            <span class="text-xs leading-tight text-zinc-400">{{ activePairCount }} active pairs</span>
          </div>
        </div>

        <UDropdownMenu :items="userMenuItems">
          <UButton variant="ghost" color="neutral" icon="i-lucide-circle-user" trailing-icon="i-lucide-chevrons-up-down">
            <span class="max-w-40 truncate">{{ session.user.name || session.user.email }}</span>
          </UButton>
        </UDropdownMenu>
      </header>

      <!-- tabs -->
      <nav class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-200 pl-1 dark:border-zinc-800" style="-webkit-overflow-scrolling: touch; scrollbar-width: none">
        <button
          v-for="t in tabs"
          :key="t.value"
          type="button"
          class="-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors"
          :class="tab === t.value
            ? 'border-primary text-primary'
            : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'"
          @click="tab = t.value"
        >
          <UIcon :name="t.icon" class="size-4" />
          {{ t.label }}
        </button>
      </nav>

      <!-- content -->
      <main class="flex-1 py-8">
        <!-- ============ PAIRS ============ -->
        <div v-if="tab === 'pairs'" class="space-y-6">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Pairs</h2>
              <p class="text-sm text-zinc-500">Route incoming paths to upstream origins</p>
            </div>
            <UButton v-if="can('pairs', 'create')" icon="i-lucide-plus" label="New pair" class="self-end sm:self-auto" @click="openEditor()" />
          </div>

          <UModal :open="!!editing" :title="editing === 'new' ? 'Create pair' : `Edit ${editing}`" @update:open="v => !v && reset()">
            <template #body>
            <UForm :state="form" :validate="validatePair" class="grid gap-5 sm:grid-cols-2" @submit="save">
              <UFormField name="path">
                <template #label>Path</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                  <template #default>
                    <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                  </template>
                  <template #content>
                    <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                      <p class="text-xs font-semibold text-white">Path</p>
                      <p class="text-xs text-zinc-200">The incoming request path this pair claims. Exact paths match only themselves. End with <code>/*</code> to match everything beneath.</p>
                    <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. /hook, /hook/*, /</p>
                    </div>
                  </template>
                </UPopover></template>
                <UInput v-model="form.path" placeholder="/hook or /hook/*" icon="i-lucide-slash" class="w-full" />
                <template #help><span>{{ pathHelp }}</span></template>
              </UFormField>
              <UFormField name="target">
                <template #label>Target origin</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                  <template #default>
                    <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                  </template>
                  <template #content>
                    <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                      <p class="text-xs font-semibold text-white">Target origin</p>
                      <p class="text-xs text-zinc-200">Absolute http(s) URL of the upstream. A path here becomes a prefix on every forwarded request. No query or fragment.</p>
                    <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. https://api.example.com</p>
                    </div>
                  </template>
                </UPopover></template>
                <UInput v-model="form.target" placeholder="https://api.example.com" icon="i-lucide-globe" class="w-full" />
              </UFormField>
              <UFormField name="upstreamHost">
                <template #label>Host header override</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                  <template #default>
                    <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                  </template>
                  <template #content>
                    <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                      <p class="text-xs font-semibold text-white">Host header override</p>
                      <p class="text-xs text-zinc-200">Host header sent to the upstream. Leave empty to use the target's own hostname. Some services (CDNs, SNI-based routers) need a specific value.</p>
                    <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. api.example.com:8443</p>
                    </div>
                  </template>
                </UPopover></template>
                <UInput v-model="form.upstreamHost" placeholder="api.example.com" icon="i-lucide-server" class="w-full" />
              </UFormField>
              <UFormField name="note">
                <template #label>Note</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                  <template #default>
                    <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                  </template>
                  <template #content>
                    <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                      <p class="text-xs font-semibold text-white">Note</p>
                      <p class="text-xs text-zinc-200">Free-form reminder of what this pair is for — shown only in this admin list.</p>
                    <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. webhooks from partner X</p>
                    </div>
                  </template>
                </UPopover></template>
                <UInput v-model="form.note" placeholder="webhooks from partner X" icon="i-lucide-notebook-pen" class="w-full" />
              </UFormField>
              <UFormField name="methods">
                <template #label>Allowed methods</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Allowed methods</p>
                        <p class="text-xs text-zinc-200">Only the selected HTTP verbs are forwarded; anything else gets 405. Leave "All" on to forward everything.</p>
                      </div>
                    </template>
                  </UPopover></template>
                <div class="flex flex-wrap items-center gap-2">
                  <UCheckbox v-model="form.methodsAll" label="All" @update:model-value="() => { if (form.methodsAll) form.methods = [] }" />
                  <template v-for="verb in allVerbs" :key="verb">
                    <button
                      type="button"
                      :disabled="form.methodsAll"
                      class="rounded-md border px-2 py-1 font-mono text-xs transition-colors disabled:opacity-40"
                      :class="form.methods.includes(verb)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-600'"
                      @click="toggleVerb(verb)"
                    >
                      {{ verb }}
                    </button>
                  </template>
                </div>
              </UFormField>
              <div class="flex flex-wrap items-center gap-x-6 gap-y-3 sm:col-span-2">
                <div class="flex items-center gap-1.5">
                  <USwitch v-model="form.stripPrefix" :disabled="!isWildcard" label="Strip prefix" />
                  <UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Strip prefix</p>
                        <p class="text-xs text-zinc-200">Remove the pair’s base path before forwarding, so <code>/hook/x</code> arrives upstream as <code>/x</code>. Wildcard pairs only.</p>
                        <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. /hook/* + strip → upstream sees /x</p>
                      </div>
                    </template>
                  </UPopover>
                </div>
                <USwitch v-model="form.enabled" label="Enabled" />
              </div>
              <div class="flex justify-end gap-2 sm:col-span-2">
                <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="reset" />
                <UButton type="submit" :loading="busy" :label="editing === 'new' ? 'Add pair' : 'Save changes'" />
              </div>
            </UForm>
            </template>
          </UModal>

          <UCard v-if="pairs.length" :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
            <ul class="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              <li v-for="p in pairs" :key="p.id" class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <code class="rounded-md bg-primary/5 px-1.5 py-0.5 text-sm font-semibold text-primary">{{ p.path }}</code>
                    <UBadge v-if="p.stripPrefix" label="strip" variant="subtle" color="warning" size="sm" />
                    <span v-if="p.methods?.length" class="font-mono text-[10px] text-zinc-400">{{ p.methods.join(' ') }}</span>
                    <UBadge v-if="!p.enabled" label="disabled" variant="subtle" color="error" size="sm" />
                  </div>
                  <div class="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <UIcon name="i-lucide-arrow-right" class="size-3" />
                    <span class="break-all font-mono">{{ p.target }}</span>
                    <span v-if="p.upstreamHost" class="truncate">· host: {{ p.upstreamHost }}</span>
                  </div>
                  <p v-if="p.note" class="mt-1 truncate text-xs text-zinc-400">{{ p.note }}</p>
                </div>
                <div class="flex shrink-0 items-center justify-end gap-2 self-end sm:self-auto">
                  <UButton icon="i-lucide-chart-line" variant="ghost" color="neutral" size="sm" label="Logs" @click="viewPairLogs(p)" />
                  <UButton v-if="can('pairs', 'update')" icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit pair" @click="edit(p)" />
                  <UButton v-if="can('pairs', 'delete')" icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" aria-label="Delete pair" @click="remove(p)" />
                </div>
              </li>
            </ul>
          </UCard>
          <div v-else class="rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
            <UIcon name="i-lucide-route" class="mx-auto size-8 text-zinc-300" />
            <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No pairs yet</p>
            <p class="mt-1 text-xs text-zinc-500">Create a pair to start forwarding requests</p>
            <UButton v-if="can('pairs', 'create')" class="mt-4" icon="i-lucide-plus" :label="can('pairs', 'create') ? 'Create your first pair' : 'No pairs yet'" @click="openEditor()" />
          </div>
        </div>

        <!-- ============ SETTINGS ============ -->
        <div v-else-if="tab === 'settings'" class="space-y-6">
          <div>
            <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Settings</h2>
            <p class="text-sm text-zinc-500">Authentication and logging configuration</p>
          </div>

          <UCard :ui="{ root: 'shadow-sm' }">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-scroll-text" class="size-4 text-zinc-400" />
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Access log</h3>
              </div>
            </template>
            <UForm :state="settingsForm" class="space-y-5" @submit="saveSettings">
              <UFormField name="logRetentionDays">
                <template #label>Retention (days)</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Retention</p>
                        <p class="text-xs text-zinc-200">Access-log entries older than this many days are deleted automatically (sweeper runs every 6 hours).</p>
                        <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. 30 (default) · 0 = keep forever</p>
                      </div>
                    </template>
                </UPopover></template>
                <UInputNumber v-model="settingsForm.logRetentionDays" :min="0" :max="3650" class="w-full max-w-48" />
              </UFormField>
              <USeparator />
              <div class="-ml-0.5 flex items-center gap-2">
                <UIcon name="i-lucide-key-round" class="size-4 text-zinc-400" />
                <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Authentication</h3>
              </div>
              <UFormField name="oidcIssuer">
                <template #label>OIDC issuer URL</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">OIDC issuer</p>
                        <p class="text-xs text-zinc-200">Base URL of your OpenID Connect provider. pathbridge fetches <code>/.well-known/openid-configuration</code> from it. Takes precedence over the env vars.</p>
                      <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. https://login.microsoftonline.com/&lt;tenant&gt;/v2.0</p>
                      </div>
                    </template>
                  </UPopover></template>
                <UInput v-model="settingsForm.oidcIssuer" placeholder="https://issuer.example.com" icon="i-lucide-globe" class="w-full" />
              </UFormField>
              <div class="grid gap-5 sm:grid-cols-2">
                <UFormField name="oidcClientId">
                  <template #label>Client ID</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Client ID</p>
                        <p class="text-xs text-zinc-200">Public client identifier issued by your OIDC provider for this app.</p>
                      </div>
                    </template>
                  </UPopover></template>
                  <UInput v-model="settingsForm.oidcClientId" icon="i-lucide-fingerprint" class="w-full" />
                </UFormField>
                <UFormField name="oidcClientSecret">
                  <template #label>Client secret</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Client secret</p>
                        <p class="text-xs text-zinc-200">Secret shared with the provider. Stored server-side and never displayed again — leave blank to keep the stored one.</p>
                      </div>
                    </template>
                  </UPopover></template>
                  <UInput v-model="settingsForm.oidcClientSecret" type="password" icon="i-lucide-key-round" class="w-full" placeholder="••••••••" />
                </UFormField>
              </div>
              <UAlert v-if="settingsEnvOidc" icon="i-lucide-info" color="info" variant="subtle" title="OIDC is also configured via environment variables" description="Settings values take precedence." />
              <div class="flex items-center gap-1.5">
                <USwitch v-model="settingsForm.disablePasswordLogin" :disabled="!oidcReady" label="Disable email + password login" />
                <UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Disable password login</p>
                        <p class="text-xs text-zinc-200">Turns off the email + password sign-in form entirely; everyone signs in via OIDC. Requires OIDC to be fully configured first — this prevents locking yourself out.</p>
                      </div>
                    </template>
                  </UPopover>
              </div>
              <div class="flex justify-end">
                <UButton type="submit" icon="i-lucide-save" :loading="busy" label="Save settings" />
              </div>
            </UForm>
          </UCard>
        </div>

        <!-- ============ USERS ============ -->
        <div v-else-if="tab === 'users'" class="space-y-6">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Users</h2>
              <p class="text-sm text-zinc-500">Who can manage this bridge</p>
            </div>
            <UButton icon="i-lucide-user-plus" label="Add user" class="self-end sm:self-auto" @click="showAddUser = !showAddUser" />
          </div>

          <UModal :open="showAddUser" title="Add user" description="Create a new account and assign its role" @update:open="v => showAddUser = v">
            <template #body>
            <UForm :state="newUser" :validate="validateNewUser" class="grid gap-5 sm:grid-cols-2" @submit="addUser">
              <UFormField label="Email" name="email">
                <UInput v-model="newUser.email" type="email" icon="i-lucide-mail" class="w-full" />
              </UFormField>
              <UFormField label="Name" name="name">
                <UInput v-model="newUser.name" icon="i-lucide-user" class="w-full" />
              </UFormField>
              <UFormField name="password">
                <template #label>Password</template>
                <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Password</p>
                        <p class="text-xs text-zinc-200">Initial password for the new user — they (or you) can change it later via Reset password.</p>
                      <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. min 8 characters</p>
                      </div>
                    </template>
                  </UPopover></template>
                <UInput v-model="newUser.password" type="password" icon="i-lucide-lock" class="w-full" />
              </UFormField>
              <div class="flex items-end justify-end gap-2">
                <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="showAddUser = false" />
                <UButton type="submit" icon="i-lucide-user-plus" :loading="busy" label="Create user" />
              </div>
            </UForm>
            </template>
          </UModal>

          <UCard :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
            <ul class="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              <li v-for="u in users" :key="u.id" class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                <UAvatar :name="u.name || u.email" size="md" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-zinc-900 dark:text-white">{{ u.name }}</span>
                    <UBadge class="font-mono" variant="subtle" color="neutral" size="sm">{{ u.role }}</UBadge>
                    <UBadge v-if="u.id === session.user.id" label="you" variant="subtle" color="primary" size="sm" />
                  </div>
                  <div class="truncate text-xs text-zinc-500">{{ u.email }}</div>
                </div>
                <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                  <span v-if="u.hasPassword" class="flex items-center gap-1" title="Has a password login"><UIcon name="i-lucide-lock" class="size-3" />password</span>
                  <span v-if="u.oidcLinked" class="flex items-center gap-1" title="Linked to OIDC"><UIcon name="i-lucide-key-round" class="size-3" />oidc</span>
                  <span class="flex items-center gap-1" title="Active sessions"><UIcon name="i-lucide-monitor-smartphone" class="size-3" />{{ u.sessionCount }}</span>
                </div>
                <div class="flex shrink-0 items-center justify-end gap-2 self-end sm:self-auto">
                  <UButton icon="i-lucide-key-round" variant="ghost" color="neutral" size="sm" label="Reset password" @click="resetPassword(u)" />
                  <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" aria-label="Delete user" :disabled="u.id === session.user.id" @click="removeUser(u)" />
                </div>
              </li>
            </ul>
          </UCard>
        </div>

        <!-- ============ ROLES ============ -->
        <div v-else-if="tab === 'roles'" class="space-y-6">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Roles</h2>
              <p class="text-sm text-zinc-500">Bundle permissions; assign to users in the Users tab.</p>
            </div>
            <UButton icon="i-lucide-plus" label="New role" class="self-end sm:self-auto" :disabled="!can('roles', 'create')" @click="openRoleEditor()" />
          </div>

          <div class="space-y-3">
            <div v-for="r in roles" :key="r.id" class="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono text-sm font-medium">{{ r.name }}</span>
                  <UBadge v-if="r.builtin" color="neutral" variant="outline" size="sm" class="text-zinc-400">builtin</UBadge>
                </div>
                <p v-if="r.description" class="mt-1 text-sm text-zinc-500">{{ r.description }}</p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <template v-for="(stmts, res) in r.statements" :key="res">
                    <UBadge v-for="st in stmts" :key="res + st" variant="subtle" size="sm" class="font-mono">
                      {{ res }}:{{ st }}
                    </UBadge>
                  </template>
                </div>
              </div>
              <div class="flex shrink-0 items-start justify-end">
                <UButton
                  icon="i-lucide-pencil" variant="ghost" color="neutral" size="sm" aria-label="Edit role"
                  :disabled="r.builtin || !can('roles', 'update')"
                  @click="openRoleEditor(r)"
                />
                <UButton
                  icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" aria-label="Delete role"
                  :disabled="r.builtin || !can('roles', 'delete')"
                  @click="deleteRole(r)"
                />
              </div>
            </div>
          </div>

          <UModal v-model:open="roleModalOpen" :title="editingRoleId ? `Edit ${roleForm.name}` : 'New role'" :description="editingRoleId ? (builtinEdit ? 'Builtin roles cannot be modified' : 'Adjust description and permissions') : 'Bundle permissions into a reusable role'">
            <template #body>
              <UForm :state="roleForm" :validate="validateRole" class="grid gap-5" @submit="saveRole">
                <UFormField name="name">
                  <template #label>Name</template>
                  <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Role name</p>
                        <p class="text-xs text-zinc-200">Unique slug for the role. Assigned to users and API keys; immutable once created.</p>
                        <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. auditor, deploy-eng</p>
                      </div>
                    </template>
                </UPopover></template>
                  <UInput v-model="roleForm.name" icon="i-lucide-shield" placeholder="e.g. auditor" class="w-full" :disabled="!!editingRoleId" />
                </UFormField>
                <UFormField name="description">
                  <template #label>Description</template>
                  <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Description</p>
                        <p class="text-xs text-zinc-200">Free-form note explaining what this role is for. Shown in the roles list.</p>
                        
                      </div>
                    </template>
                </UPopover></template>
                  <UInput v-model="roleForm.description" icon="i-lucide-pen-line" placeholder="optional" class="w-full" />
                </UFormField>
                <UFormField name="permissions">
                  <template #label>Permissions</template>
                  <template #hint><UPopover mode="hover" :content="{ side: 'top', align: 'center' }">
                    <template #default>
                      <UIcon name="i-lucide-info" class="mb-0.5 size-3.5 shrink-0 cursor-help text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />
                    </template>
                    <template #content>
                      <div class="max-w-64 space-y-1.5 rounded-md bg-zinc-800 p-3 text-left shadow-lg ring-1 ring-zinc-700 dark:bg-zinc-900 dark:ring-zinc-700">
                        <p class="text-xs font-semibold text-white">Permissions</p>
                        <p class="text-xs text-zinc-200">Statements follow action:scope. action:all implies action:own. Toggle the badges per resource; grey = granted, muted = off.</p>
                        <p class="rounded bg-white/10 px-1.5 py-1 font-mono text-[11px] text-white break-all">e.g. read:all, update:own</p>
                      </div>
                    </template>
                </UPopover></template>
                  <div class="w-full space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <div v-for="(stmts, res) in vocabulary" :key="res">
                      <p class="mb-1.5 font-mono text-xs uppercase tracking-wide text-zinc-400">{{ res }}</p>
                      <div class="flex flex-wrap gap-1.5">
                        <UButton
                          v-for="st in stmts" :key="st" size="xs" variant="soft"
                          :color="(roleForm.statements[res] ?? []).includes(st) ? 'primary' : 'neutral'"
                          :label="st" type="button" @click="toggleStatement(String(res), st)"
                        />
                      </div>
                    </div>
                  </div>
                </UFormField>
                <div class="flex items-end justify-end gap-2">
                  <UButton type="button" variant="ghost" color="neutral" label="Cancel" @click="roleModalOpen = false" />
                  <UButton type="submit" :icon="editingRoleId ? 'i-lucide-check' : 'i-lucide-plus'" :loading="busy" :label="editingRoleId ? 'Save changes' : 'Create role'" />
                </div>
              </UForm>
            </template>
          </UModal>
        </div>

        <!-- ============ LOGS ============ -->
        <div v-else-if="tab === 'logs'" class="space-y-6">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">Access log</h2>
              <p class="text-sm text-zinc-500">
                {{ logFilter ? `Filtered by pair ${logFilter.path}` : 'All forwarded traffic' }}
              </p>
            </div>
            <div class="flex items-center gap-2 self-end sm:self-auto">
              <UButton v-if="logFilter" variant="outline" color="neutral" icon="i-lucide-x" label="Clear filter" @click="logFilter = null; loadLogs()" />
              <UButton icon="i-lucide-refresh-cw" variant="outline" color="neutral" label="Refresh" :loading="logsBusy" @click="loadLogs()" />
            </div>
          </div>

          <UCard :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }">
            <div v-if="logs.length" class="overflow-x-auto" style="-webkit-overflow-scrolling: touch">
              <table class="w-full min-w-[640px] text-sm">
                <thead>
                  <tr class="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
                    <th class="px-5 py-3 font-medium">Time</th>
                    <th class="px-3 py-3 font-medium">Method</th>
                    <th class="px-3 py-3 font-medium">Path</th>
                    <th class="px-3 py-3 font-medium">Pair</th>
                    <th class="px-3 py-3 font-medium">Status</th>
                    <th class="px-3 py-3 font-medium">Took</th>
                    <th class="px-5 py-3 font-medium">Client</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100 font-mono text-xs dark:divide-zinc-800/60">
                  <tr v-for="e in logs" :key="e.id" class="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                    <td class="whitespace-nowrap px-5 py-2.5 text-zinc-500">{{ fmtTime(e.ts) }}</td>
                    <td class="px-3 py-2.5 font-semibold text-zinc-600 dark:text-zinc-300">{{ e.method }}</td>
                    <td class="max-w-72 truncate px-3 py-2.5 text-zinc-800 dark:text-zinc-200">{{ e.path }}</td>
                    <td class="px-3 py-2.5"><span v-if="e.pairPath" class="rounded bg-primary/5 px-1.5 py-0.5 text-primary">{{ e.pairPath }}</span></td>
                    <td class="px-3 py-2.5">
                      <span class="rounded px-1.5 py-0.5 font-semibold" :class="statusClass(e.status)">{{ e.status }}</span>
                    </td>
                    <td class="whitespace-nowrap px-3 py-2.5 text-zinc-500">{{ e.durationMs }}ms</td>
                    <td class="whitespace-nowrap px-5 py-2.5 text-zinc-400">{{ e.clientIp || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="p-10 text-center">
              <UIcon name="i-lucide-scroll-text" class="mx-auto size-8 text-zinc-300" />
              <p class="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">No traffic logged</p>
              <p class="mt-1 text-xs text-zinc-500">Requests forwarded by pairs appear here</p>
            </div>
            <div v-if="logs.length >= logPageSize" class="flex justify-center border-t border-zinc-100 py-3 dark:border-zinc-800/60">
              <UButton variant="soft" color="neutral" size="sm" label="Load more" :loading="logsBusy" @click="loadLogs(true)" />
            </div>
          </UCard>
        </div>
      </main>
    </div>

    <!-- password reset modal -->
    <UModal v-model:open="pwModalOpen" title="Reset password" description="Set a new password for this user">
      <template #body>
        <UForm :state="pwModal" class="space-y-4" @submit="submitPasswordReset">
          <UFormField label="New password" name="password" help="Minimum 8 characters">
            <UInput v-model="pwModal.password" type="password" icon="i-lucide-lock" class="w-full" required />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" label="Cancel" @click="pwModalOpen = false" />
            <UButton type="submit" :loading="busy" label="Set password" />
          </div>
        </UForm>
      </template>
    </UModal>

    <!-- delete confirm modal -->
    <UModal v-model:open="deleteModalOpen" title="Delete pair" :description="deleteModal.what">
      <template #body>
        <p class="text-sm text-zinc-500">This action cannot be undone.</p>
        <div class="mt-4 flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" label="Cancel" @click="deleteModalOpen = false" />
          <UButton color="error" icon="i-lucide-trash-2" label="Delete" @click="confirmDelete" />
        </div>
      </template>
    </UModal>

    <!-- profile modal -->
    <UModal v-model:open="profileOpen" title="Profile" description="Your account settings">
      <template #body>
        <div class="space-y-6">
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Account</h3>
            <UFormField label="Name" size="sm">
              <UInput v-model="profile.name" icon="i-lucide-user" placeholder="Your name" class="w-full" />
            </UFormField>
            <UFormField label="Email" size="sm">
              <UInput v-model="profile.email" type="email" icon="i-lucide-mail" placeholder="you@example.com" class="w-full" />
            </UFormField>
            <UButton :loading="busy" label="Save changes" icon="i-lucide-check" size="sm" class="mt-1" @click="saveProfile" />
          </div>
          <USeparator />
          <div class="space-y-3">
            <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Password</h3>
            <UFormField label="Current password" size="sm">
              <UInput v-model="pwForm.current" type="password" icon="i-lucide-lock" class="w-full" />
            </UFormField>
            <UFormField label="New password" size="sm">
              <UInput v-model="pwForm.next" type="password" icon="i-lucide-lock" placeholder="min 8 characters" class="w-full" />
            </UFormField>
            <UFormField label="Confirm new password" size="sm">
              <UInput v-model="pwForm.confirm" type="password" icon="i-lucide-lock" class="w-full" />
            </UFormField>
            <UButton :loading="pwBusy" color="neutral" label="Change password" icon="i-lucide-key-round" size="sm" class="mt-1" @click="changePassword" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { PairRow, PairsResponse } from '../../../shared/types'
import { pairSubmitSchema } from '~/utils/pair-form'

interface SessionUser { id: string, name?: string | null, email: string }
interface SessionPayload { user: SessionUser, session: { expiresAt: string } }
interface AuthConfig { passwordEnabled: boolean, oidcEnabled: boolean }
interface AdminUser { id: string, name: string, email: string, emailVerified: boolean, role: string, createdAt: string, sessionCount: number, hasPassword: boolean, oidcLinked: boolean }
interface LogRow { id: number, ts: string, pairId: number | null, pairPath: string | null, method: string, path: string, status: number, durationMs: number, clientIp: string | null, userAgent: string | null }

const toast = useToast()

// ---------- state ----------
const loginState = reactive({ email: '', password: '' })
const loginError = ref('')
const session = ref<SessionPayload | null>(null)
const perms = ref<Record<string, string[]>>({})
function can(resource: string, action: string, scope: 'own' | 'all' | 'any' = 'any') {
  const set = perms.value[resource] ?? []
  if (set.includes(`${action}:all`)) return true
  if (scope === 'any' || scope === 'own') return set.includes(`${action}:own`)
  return false
}
const pairs = ref<PairRow[]>([])
const busy = ref(false)
const editing = ref('')
const authConfig = ref<AuthConfig | null>(null)

const tab = ref<'pairs' | 'settings' | 'users' | 'roles' | 'logs'>('pairs')
const tabs = computed(() => [
  { label: 'Pairs', icon: 'i-lucide-route', value: 'pairs' as const, show: can('pairs', 'read') },
  { label: 'Settings', icon: 'i-lucide-settings', value: 'settings' as const, show: can('settings', 'read') },
  { label: 'Users', icon: 'i-lucide-users', value: 'users' as const, show: can('users', 'read') },
  { label: 'Roles', icon: 'i-lucide-shield', value: 'roles' as const, show: can('roles', 'read') },
  { label: 'Logs', icon: 'i-lucide-scroll-text', value: 'logs' as const, show: can('logs', 'read') },
].filter(t => t.show))

const userMenuItems = computed(() => [[
  { label: session.value?.user.email, icon: 'i-lucide-user', disabled: true, class: 'opacity-60' },
  { label: 'Profile', icon: 'i-lucide-id-card', onSelect: openProfile },
  { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: logout },
]])

const activePairCount = computed(() => pairs.value.filter(p => p.enabled).length)



// ---------- profile ----------
const profileOpen = ref(false)
const profile = reactive({ name: '', email: '' })
const pwForm = reactive({ current: '', next: '', confirm: '' })
const pwBusy = ref(false)

function openProfile() {
  profile.name = session.value?.user.name ?? ''
  profile.email = session.value?.user.email ?? ''
  pwForm.current = ''; pwForm.next = ''; pwForm.confirm = ''
  profileOpen.value = true
}

async function saveProfile() {
  busy.value = true
  try {
    const body: Record<string, string> = {}
    if (profile.name.trim() && profile.name !== session.value?.user.name) body.name = profile.name.trim()
    if (profile.email.trim() && profile.email !== session.value?.user.email) body.email = profile.email.trim()
    if (Object.keys(body).length === 0) {
      busy.value = false
      toast.add({ title: 'No changes to save', color: 'neutral' })
      return
    }
    await $fetch('/auth/update-user', { method: 'POST', body })
    session.value = { ...session.value!, user: { ...session.value!.user, ...body } }
    toast.add({ title: 'Profile updated', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string, message?: string }, message?: string }
    toast.add({ title: 'Update failed', description: err.data?.statusMessage || err.data?.message || err.message, color: 'error' })
  }
  busy.value = false
}

async function changePassword() {
  if (pwForm.next !== pwForm.confirm) {
    toast.add({ title: 'Passwords do not match', color: 'error' })
    return
  }
  if (pwForm.next.length < 8) {
    toast.add({ title: 'Password too short', description: 'Minimum 8 characters', color: 'error' })
    return
  }
  pwBusy.value = true
  try {
    await $fetch('/auth/change-password', { method: 'POST', body: { currentPassword: pwForm.current, newPassword: pwForm.next, revokeOtherSessions: true } })
    pwForm.current = ''; pwForm.next = ''; pwForm.confirm = ''
    toast.add({ title: 'Password changed', description: 'Other sessions were signed out', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string, message?: string }, message?: string }
    toast.add({ title: 'Change failed', description: err.data?.statusMessage || err.data?.message || err.message, color: 'error' })
  }
  pwBusy.value = false
}

// ---------- roles ----------
interface RoleRow { id: string, name: string, description: string | null, statements: Record<string, string[]>, builtin: boolean }
const roles = ref<RoleRow[]>([])
const vocabulary = ref<Record<string, string[]>>({})
const roleModalOpen = ref(false)
const roleForm = reactive({ name: '', description: '', statements: {} as Record<string, string[]> })
const editingRoleId = ref<string | null>(null)
const builtinEdit = computed(() => roles.value.find(r => r.id === editingRoleId.value)?.builtin ?? false)

async function loadRoles() {
  const data = await $fetch<{ roles: RoleRow[], vocabulary: Record<string, string[]> }>('/api/roles')
  roles.value = data.roles
  vocabulary.value = data.vocabulary
}

function validateRole(state: { name: string }): Array<{ name: string, message: string }> {
  const errs: Array<{ name: string, message: string }> = []
  if (!state.name.trim()) errs.push({ name: 'name', message: 'Name is required' })
  else if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(state.name.trim())) errs.push({ name: 'name', message: '2-32 chars: lowercase letters, digits, hyphens' })
  return errs
}

function openRoleEditor(role?: RoleRow) {
  if (role) {
    editingRoleId.value = role.id
    roleForm.name = role.name
    roleForm.description = role.description ?? ''
    roleForm.statements = JSON.parse(JSON.stringify(role.statements ?? {}))
  }
  else {
    editingRoleId.value = null
    roleForm.name = ''
    roleForm.description = ''
    roleForm.statements = {}
  }
  roleModalOpen.value = true
}

function toggleStatement(resource: string, stmt: string) {
  const cur = roleForm.statements[resource] ?? []
  roleForm.statements[resource] = cur.includes(stmt) ? cur.filter(s => s !== stmt) : [...cur, stmt]
}

async function saveRole() {
  busy.value = true
  try {
    if (editingRoleId.value) {
      await $fetch(`/api/roles/${encodeURIComponent(editingRoleId.value)}`, {
        method: 'PUT',
        body: { description: roleForm.description.trim() || null, statements: roleForm.statements },
      })
      toast.add({ title: 'Role updated', color: 'success' })
    }
    else {
      await $fetch('/api/roles', {
        method: 'POST',
        body: { name: roleForm.name.trim().toLowerCase(), description: roleForm.description.trim() || null, statements: roleForm.statements },
      })
      toast.add({ title: 'Role created', color: 'success' })
    }
    await loadRoles()
    roleModalOpen.value = false
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: editingRoleId.value ? 'Update failed' : 'Create failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function deleteRole(r: RoleRow) {
  try {
    await $fetch(`/api/roles/${encodeURIComponent(r.id)}`, { method: 'DELETE' })
    await loadRoles()
    toast.add({ title: 'Role deleted', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Delete failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}

// ---------- pair form ----------
const allVerbs = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
const emptyForm = () => ({ id: undefined as number | undefined, path: '', target: '', upstreamHost: undefined as string | undefined, note: undefined as string | undefined, stripPrefix: false, methodsAll: true, methods: [] as string[], enabled: true })
const form = reactive(emptyForm())

function toggleVerb(v: string) {
  const i = form.methods.indexOf(v)
  if (i >= 0) form.methods.splice(i, 1)
  else form.methods.push(v)
}

const isWildcard = computed(() => form.path.trim().endsWith('/*') || form.path.trim() === '/')
const pathHelp = computed(() => isWildcard.value ? 'Wildcard — matches this path and everything under it' : 'Exact match — this path only. Add /* for a subtree')

function openEditor() {
  editing.value = 'new'
}

function validatePair(state: typeof form): Array<{ name: string, message: string }> {
  const result = pairSubmitSchema.safeParse(state)
  if (result.success) return []
  return result.error.issues
    .filter(i => i.path.length > 0)
    .map(i => ({ name: String(i.path[0]), message: i.message }))
}

// ---------- users ----------
const users = ref<AdminUser[]>([])
const showAddUser = ref(false)
const newUser = reactive({ email: '', name: '', password: '', role: 'viewer' })

function validateNewUser(state: typeof newUser): Array<{ name: string, message: string }> {
  const errors: Array<{ name: string, message: string }> = []
  if (!/^\S+@\S+\.\S+$/.test(state.email)) errors.push({ name: 'email', message: 'Enter a valid email' })
  if (state.name.trim().length === 0) errors.push({ name: 'name', message: 'Name is required' })
  if (state.password.length < 8) errors.push({ name: 'password', message: 'At least 8 characters' })
  return errors
}

const pwModalOpen = ref(false)
const pwModal = reactive({ userId: '', email: '', password: '' })

function resetPassword(u: AdminUser) {
  pwModal.userId = u.id
  pwModal.email = u.email
  pwModal.password = ''
  pwModalOpen.value = true
}

// ---------- delete confirm ----------
const deleteModalOpen = ref(false)
const deleteModal = reactive({ what: '', kind: '' as 'pair' | 'user', id: '', pairPath: '' })

function remove(p: PairRow) {
  deleteModal.what = `${p.path} → ${p.target}`
  deleteModal.kind = 'pair'
  deleteModal.id = String(p.id)
  deleteModal.pairPath = p.path
  deleteModalOpen.value = true
}

function removeUser(u: AdminUser) {
  deleteModal.what = `user ${u.email} and all their sessions`
  deleteModal.kind = 'user'
  deleteModal.id = u.id
  deleteModalOpen.value = true
}

// ---------- logs ----------
const logs = ref<LogRow[]>([])
const logsBusy = ref(false)
const logPageSize = 50
const logFilter = ref<{ id: number, path: string } | null>(null)

function viewPairLogs(p: PairRow) {
  logFilter.value = { id: p.id, path: p.path }
  tab.value = 'logs'
  loadLogs()
}

function statusClass(status: number): string {
  if (status >= 500) return 'bg-red-500/10 text-red-600'
  if (status >= 400) return 'bg-amber-500/10 text-amber-600'
  return 'bg-emerald-500/10 text-emerald-600'
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------- settings ----------
const settingsForm = reactive({ logRetentionDays: 30, oidcIssuer: '', oidcClientId: '', oidcClientSecret: '', disablePasswordLogin: false })
const settingsSecretSet = ref(false)
const settingsEnvOidc = ref(false)
const oidcReady = computed(() => settingsForm.oidcIssuer.trim().length > 0 && settingsForm.oidcClientId.trim().length > 0 && (settingsForm.oidcClientSecret.length > 0 || settingsSecretSet.value))

async function loadPerms() {
  try {
    const me = await $fetch<{ permissions: Record<string, string[]> }>('/api/me')
    perms.value = me.permissions ?? {}
  }
  catch { perms.value = {} }
}

async function boot() {
  await Promise.all([
    can('pairs', 'read') ? load() : Promise.resolve(),
    can('users', 'read') ? loadUsers().catch(() => {}) : Promise.resolve(),
    can('roles', 'read') ? loadRoles().catch(() => {}) : Promise.resolve(),
    can('settings', 'read') ? loadSettings().catch(() => {}) : Promise.resolve(),
  ])
  const first = tabs.value[0]
  if (first && !tabs.value.some(t => t.value === tab.value)) tab.value = first.value
}

// ---------- lifecycle ----------
onMounted(async () => {
  try {
    authConfig.value = await $fetch<AuthConfig>('/api/auth-config')
  }
  catch {
    authConfig.value = { passwordEnabled: true, oidcEnabled: false }
  }
  try {
    const s = await $fetch<SessionPayload | null>('/auth/get-session')
    session.value = s?.user ? s : null
    if (session.value) {
      await loadPerms()
      await boot()
    }
  }
  catch { /* not signed in */ }
})

watch(isWildcard, (w) => {
  if (!w && form.stripPrefix) form.stripPrefix = false
})

// ---------- actions ----------
async function login() {
  busy.value = true
  loginError.value = ''
  try {
    const res = await $fetch<SessionPayload>('/auth/sign-in/email', {
      method: 'POST',
      body: { email: loginState.email, password: loginState.password },
    })
    session.value = res
    await loadPerms()
    await boot()
  }
  catch {
    loginError.value = 'Invalid email or password'
  }
  busy.value = false
}

async function oidcLogin() {
  try {
    const res = await $fetch<{ url: string }>('/auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'oidc', callbackURL: '/admin' },
    })
    if (res.url) window.location.href = res.url
  }
  catch {
    toast.add({ title: 'SSO unavailable', description: 'OIDC provider not reachable', color: 'error' })
  }
}

async function logout() {
  await $fetch('/auth/sign-out', { method: 'POST' }).catch(() => {})
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
  Object.assign(form, JSON.parse(JSON.stringify(p)))
  form.id = p.id
  form.methodsAll = !p.methods || p.methods.length === 0
  form.methods = p.methods ? [...p.methods] : []
}

function reset() {
  editing.value = ''
  Object.assign(form, emptyForm())
}

async function save() {
  busy.value = true
  try {
    const parsed = pairSubmitSchema.safeParse({ ...form })
    if (!parsed.success) {
      toast.add({ title: 'Check the form', description: parsed.error.issues[0]?.message, color: 'error' })
      busy.value = false
      return
    }
    const data = await $fetch<PairsResponse>('/api/pairs', {
      method: 'PUT',
      body: {
        ...parsed.data,
        id: editing.value && editing.value !== 'new' ? form.id : undefined,
        methods: form.methodsAll || form.methods.length === 0 ? undefined : form.methods,
      },
    })
    pairs.value = data.pairs
    toast.add({ title: editing.value && editing.value !== 'new' ? 'Pair updated' : 'Pair added', color: 'success' })
    reset()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Save failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function confirmDelete() {
  try {
    if (deleteModal.kind === 'pair') {
      const data = await $fetch<PairsResponse>(`/api/pairs/${deleteModal.id}`, { method: 'DELETE' })
      pairs.value = data.pairs
      if (editing.value === deleteModal.pairPath) reset()
      toast.add({ title: 'Pair deleted', color: 'success' })
    }
    else {
      await $fetch(`/api/users/${encodeURIComponent(deleteModal.id)}`, { method: 'DELETE' })
      await loadUsers()
      toast.add({ title: 'User deleted', color: 'success' })
    }
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Delete failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  deleteModalOpen.value = false
}

async function loadUsers() {
  const data = await $fetch<{ users: AdminUser[] }>('/api/users')
  users.value = data.users
}

async function addUser() {
  busy.value = true
  try {
    await $fetch('/api/users', { method: 'POST', body: { ...newUser } })
    newUser.email = ''
    newUser.name = ''
    newUser.password = ''
    newUser.role = 'viewer'
    showAddUser.value = false
    await loadUsers()
    toast.add({ title: 'User created', color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Create failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function submitPasswordReset() {
  if (pwModal.password.length < 8) {
    toast.add({ title: 'Too short', description: 'Password must be at least 8 characters', color: 'error' })
    return
  }
  busy.value = true
  try {
    await $fetch(`/api/users/${encodeURIComponent(pwModal.userId)}/password`, { method: 'PUT', body: { password: pwModal.password } })
    pwModalOpen.value = false
    toast.add({ title: `Password updated for ${pwModal.email}`, color: 'success' })
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Reset failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}

async function loadLogs(append = false) {
  logsBusy.value = true
  try {
    const beforeId = append && logs.value.length ? logs.value[logs.value.length - 1]?.id : undefined
    const data = await $fetch<{ entries: LogRow[] }>('/api/logs', {
      query: {
        limit: logPageSize,
        ...(logFilter.value ? { pairId: logFilter.value.id } : {}),
        ...(beforeId !== undefined ? { beforeId } : {}),
      },
    })
    logs.value = append ? [...logs.value, ...data.entries] : data.entries
  }
  catch { /* ignore */ }
  logsBusy.value = false
}

watch(tab, (t) => {
  if (t === 'logs' && logs.value.length === 0) loadLogs().catch(() => {})
})

async function loadSettings() {
  const s = await $fetch<{ oidcIssuer: string, oidcClientId: string, oidcClientSecretSet: boolean, disablePasswordLogin: boolean, logRetentionDays: number, envOidc: boolean }>('/api/settings')
  settingsForm.oidcIssuer = s.oidcIssuer
  settingsForm.oidcClientId = s.oidcClientId
  settingsForm.oidcClientSecret = ''
  settingsSecretSet.value = s.oidcClientSecretSet
  settingsForm.disablePasswordLogin = s.disablePasswordLogin
  settingsForm.logRetentionDays = s.logRetentionDays
  settingsEnvOidc.value = s.envOidc
}

async function saveSettings() {
  busy.value = true
  try {
    const body: Record<string, unknown> = {
      oidcIssuer: settingsForm.oidcIssuer.trim(),
      oidcClientId: settingsForm.oidcClientId.trim(),
      disablePasswordLogin: settingsForm.disablePasswordLogin,
      logRetentionDays: settingsForm.logRetentionDays,
    }
    if (settingsForm.oidcClientSecret.trim() !== '') body.oidcClientSecret = settingsForm.oidcClientSecret.trim()
    await $fetch('/api/settings', { method: 'PUT', body })
    toast.add({ title: 'Settings saved', color: 'success' })
    await loadSettings()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Save failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
  busy.value = false
}
</script>
