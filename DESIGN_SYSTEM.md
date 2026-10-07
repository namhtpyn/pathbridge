# pathbridge — DESIGN_SYSTEM

Single-page admin (`app/pages/admin/index.vue`) on **Nuxt UI v4** only — no custom CSS files, no pure HTML styling. Everything below is the convention an AI agent (or human) must follow when touching the UI.

## Stack & tokens

- **Nuxt UI v4** (`@nuxt/ui` 4.x) + Tailwind v4 via `app/assets/css/main.css` (`@import "tailwindcss"; @import "@nuxt/ui";`). No component library mixing.
- Palette: **zinc** neutrals + **primary** (blue) accents. Dark mode = class-based, zinc-800 borders (`dark:border-zinc-800`).
- App shell: `UApp` root (`app/app.vue`), global config in `app/app.config.ts`.
- Icons: `i-lucide-*` only.

## Layout skeleton

```
<header>  sticky top bar: logo mark + "Pathbridge v{APP_VERSION}" wordmark | right: avatar dropdown
<nav>     horizontal tabs, underline style (border-b-2), scrollable on mobile
<main>    max-w-6xl container, py-8, one <div v-if/else-if> per tab
```

- Tabs: `<button>` with `UIcon` + label; active = `border-primary text-primary`, inactive = zinc-500.
- Tab order: Pairs, Settings, Users, Roles, Logs. Tabs render ONLY what the user's permissions allow (`can()` from `/api/me`).

## Component map (use exactly these)

| Need | Component |
|---|---|
| Page section card | `UCard` (`:ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }"` for list cards) |
| Form | `UForm` + `UFormField` (always — never bare inputs) |
| Text input | `UInput` with `icon="i-lucide-*"` + placeholder, `class="w-full"` |
| Select | `USelect` |
| Switch | `USwitch` (+ `label`); needs help icon → flex wrapper OUTSIDE the label, popover law above |
| Radio matrix | `URadioGroup variant="list"` with unlabeled single-item arrays (see permission matrices) |
| Button | `UButton`; primary = label only; destructive in tables = `variant="ghost" color="error" size="sm"` + `aria-label` |
| Confirmation | `UModal` (NEVER native `confirm()`) |
| Status chip | `UBadge variant="subtle"`; monospace for code-ish values (`pairs:read:all`, verbs) |
| Feedback | `useToast()` → `toast.add({ title, color: 'success'|'error'|'neutral' })` |
| Hover help | `UPopover mode="hover"` around a `i-lucide-info` icon — inside the field's `#hint` slot, NEVER `#label` (reka-ui `<Label :for>` swallows clicks/focus); `USwitch` has no `#hint` slot → wrap switch + icon in a flex `<div>` outside the label |

## Form pattern (THE law)

Every form — pair editor, user create, role create, profile — follows the same shape:

1. `UForm :state="…" :validate="validateX" @submit="saveX"` (client validation is UX only; backend re-validates).
2. `UFormField label="…" name="…" hint="optional guidance"`, each field full-width inside `class="w-full"`.
3. Multi-column on desktop: `class="grid gap-5 sm:grid-cols-2"`; single column stacks on mobile.
4. Actions row at the end: `Cancel` (`variant="ghost" color="neutral"`) left of the primary `type="submit"` button, right-aligned.
5. Validator functions return `Array<{ name, message }>` and mirror the backend zod rules (same messages where possible).
6. On save: optimistic reset only after response; toast success (`success`) or failure with `err.data?.statusMessage` (`error`).

## Tables & lists

- **Every record list is a `UTable`** (v1.22.0 unified: pairs, users, roles, logs — no mixed card lists, no hand-rolled HTML tables). Wrap in `UCard :ui="{ root: 'shadow-sm', body: 'p-0 sm:p-0' }"`.
- Column defs are typed `TableColumn<T>[]` with `meta: { class: { td: 'w-full' } }` on the flexible column and a trailing empty-header `id: 'actions'` column for right-aligned row actions.
- Custom cells via `#<accessor>-cell` slots (`#path-cell`, `#user-cell`, `#actions-cell`…) keeping badges, monospace chips and stacked text inside cells.
- **Permission matrices (role editor, API-key scope) use UTable grouped rows**: `:grouping="['resource']"` + `getGroupedRowModel()` with `groupedColumnMode: false` (NOT 'remove' — remove deletes the grouping column and its cell slot never renders). Group row = expand toggle + resource name; member rows = `action` + None/Own/All `URadioGroup` columns (one radio per column, `variant="list"`, `:ui="{ fieldset: 'justify-center' }"`). Scope cells hide entirely when the vocabulary (roles) or the caller's own grants (key scoping) don't allow them.
- Every action button gets an `aria-label` (agents + screen readers): `aria-label="Edit pair"`, `"Delete pair"`.
- Empty state: centered `i-lucide-*` icon, short heading, one-line hint; CTA button only if the user has the create permission; neutral copy for read-only users ("No pairs yet" — not "Create your first pair").

## Modals

- `UModal` with `title` (+ `description` when a subtitle helps). Content in `#body` template slot.
- One purpose per modal. Destructive confirms show the target name in the description and use a `color="error"` confirm button.
- Modals that edit must PRE-POPULATE from state before opening (populate-then-open, e.g. `openProfile()`), never rely on `@update:open` side effects.
- A no-op save must give feedback ("No changes to save"), never silently return.

## Mobile (390px)

- Tabs scroll horizontally (`overflow-x-auto`, hidden scrollbar).
- Rows stack; tables get `min-width` + horizontal scroll containers.
- Modals full-height sheet style (UModal default handles this).

## Visual QA process (mandatory for UI changes)

1. Drive the real UI in a browser (login → act → observe), not curl.
2. Screenshot every changed surface; run through a vision model with a harsh, specific prompt.
3. Fix what it flags; re-verify. Known trap: screenshots mid-validation (red borders, hidden buttons) produce false alarms — verify the flag against a clean state before "fixing".
4. Verify with BOTH an admin and a restricted role (viewer) — permissions hide UI and must hide the *invitation* too (empty-state copy, buttons).

## Anti-patterns (never do)

- Native `confirm()`/`alert()`/`prompt()`.
- Icon-only buttons without `aria-label`.
- New colors outside zinc/primary/error/success semantics.
- Unstyled or pure-HTML inputs; custom CSS files; component libraries besides Nuxt UI.
- Permission-dependent UI decided by anything other than `/api/me` permissions.
- Success toasts on failure paths; silent no-op handlers.
