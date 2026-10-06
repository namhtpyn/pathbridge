// Shared types for pathbridge pairs (server<->client single source of truth).

/** Row shape returned by /api/pairs (serialized JSON — dates as ISO strings). */
export interface PairRow {
  id: number
  /** URL path prefix this pair claims, e.g. "/hook". Always starts with "/". */
  path: string
  /** Absolute upstream origin to forward to, e.g. "https://api.example.com" (no path). */
  target: string
  /** Host header sent upstream. Defaults to the upstream's hostname. */
  upstreamHost: string | null
  /** Strip the pair's path prefix before forwarding. */
  stripPrefix: boolean
  /** Free-form note shown in the UI. */
  note: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** Payload accepted by PUT /api/pairs (upsert). */
export interface PairInput {
  path: string
  target: string
  upstreamHost?: string
  stripPrefix?: boolean
  note?: string
  enabled?: boolean
}

export interface PairsResponse {
  pairs: PairRow[]
}

/** Runtime guard for untrusted PUT bodies. */
export function isPairInput(v: unknown): v is PairInput {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.path === 'string' && typeof o.target === 'string'
}
