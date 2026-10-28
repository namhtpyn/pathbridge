// Header names that must never be overridden through the proxy — shared by the
// strict server schema and the UI form schema so they cannot drift. (host is
// deliberately ABSENT: setting Host is the documented way to pin vhost upstreams.)
// Readonly: this is a security set, so no caller may add/remove entries.
export const HOP_BY_HOP: ReadonlySet<string> = Object.freeze(new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]))
