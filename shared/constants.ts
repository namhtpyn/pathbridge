// Header names that must never be overridden through the proxy — shared by the
// strict server schema and the UI form schema so they cannot drift. (host is
// deliberately ABSENT: setting Host is the documented way to pin vhost upstreams.)
const HOP_BY_HOP_NAMES = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
] as const

// The Set is module-PRIVATE on purpose: Object.freeze() does not stop
// add()/delete() (it only locks the object's own properties), so exporting a
// "frozen" Set left the security list mutable through the very API it exposed.
const HOP_BY_HOP_SET: ReadonlySet<string> = new Set(HOP_BY_HOP_NAMES)

/** true when `name` is hop-by-hop, i.e. a route must not set or forward it. */
export function isHopByHop(name: string): boolean {
  return HOP_BY_HOP_SET.has(name.trim().toLowerCase())
}

/**
 * @deprecated use isHopByHop(). Compatibility view for consumers that still
 * need the name list (the strict route schema's `.has()` and the admin form's
 * enumeration). It is a COPY, so mutating it cannot desynchronise validation.
 */
export const HOP_BY_HOP: ReadonlySet<string> = new Set(HOP_BY_HOP_NAMES)
