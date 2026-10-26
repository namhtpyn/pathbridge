// Extract a human-readable message from an oRPC/h3/fetch error for toasts —
// the shared description pattern for every admin mutation (oRPC nests the
// message under data.statusMessage, h3 under message).
export function errorMessage(e: unknown): string | undefined {
  const err = e as { data?: { statusMessage?: string, message?: string }, message?: string }
  return err.data?.statusMessage || err.data?.message || err.message
}
