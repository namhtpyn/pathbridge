// Shared TYPES only (no validation). Schemas intentionally live separately:
// server/utils/route-schema.ts (strict, security) and inline in the admin UI
// (loose, UX) — frontend validation is for UX, the backend re-validates
// everything for security.

/** Row shape returned by /api/routes (serialized JSON — dates as ISO strings). */
export interface RouteRow {
  id: number
  /** URL path prefix this route claims, e.g. "/hook". Always starts with "/". */
  path: string
  /** Absolute upstream origin to forward to, e.g. "https://api.example.com" (no path). */
  target: string
  /** Host header sent upstream. Defaults to the upstream's hostname. */
  upstreamHost: string | null
  /** Strip the route's path prefix before forwarding. */
  stripPrefix: boolean
  /** Allowed HTTP verbs; null = all. Serialized JSON array in the row. */
  methods: string[] | null
  /** Free-form note shown in the UI. */
  note: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Frontend form model — LOOSE on purpose: inputs naturally produce
 * undefined | null | '' | string. The backend zod schema
 * (server/utils/route-schema.ts) is the strict authority and accepts none
 * of those for required fields.
 */
export interface RouteFormInput {
  path: string
  target: string
  upstreamHost?: string | null
  note?: string | null
  stripPrefix?: boolean
  enabled?: boolean
}

export interface RoutesResponse {
  routes: RouteRow[]
}

export interface AuthConfig {
  passwordEnabled: boolean
  oidcEnabled: boolean
}
