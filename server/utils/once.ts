/** Run fn at most once; concurrent callers share the same promise. */
export function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined
  return () => {
    p ??= fn()
    return p
  }
}
