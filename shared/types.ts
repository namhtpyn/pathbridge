// Shared TYPES only (no validation). Schemas intentionally live separately:
// server/domains/routes/routes.schema.ts (strict, security) and inline in the admin UI
// (loose, UX) — frontend validation is for UX, the backend re-validates
// everything for security.

/** Row shape returned by routes procedures (serialized JSON — dates as ISO strings). */
export type RouteRow = {
  id: number
  /** URL path prefix this route claims, e.g. "/hook". Always starts with "/". */
  path: string
  /** Absolute upstream URL to forward to, e.g. "https://api.example.com" or
   *  "https://api.example.com/base". A base path is honored: exact routes
   *  forward it verbatim, wildcard routes use it as the prefix. */
  target: string
  /** Headers set/removed on the request before it reaches the upstream. */
  requestHeaders: Array<{ name: string, op: 'set' | 'remove', value?: string }> | null
  /** Headers set/removed on the proxied response before it reaches the client. */
  responseHeaders: Array<{ name: string, op: 'set' | 'remove', value?: string }> | null
    /** Allowed HTTP verbs; null = all. Serialized JSON array in the row. */
  methods: string[] | null
  /** Free-form note shown in the UI. */
  note: string | null
  enabled: boolean
  /** Owner (null = system-owned legacy rows). Present on API output; not a form field. */
  userId: string | null
  createdAt: string
  updatedAt: string
}

export type AuthConfig = {
  passwordEnabled: boolean
  oidcEnabled: boolean
  providers: Array<{ id: string, label: string }>
}
