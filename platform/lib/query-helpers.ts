/**
 * Server-side query utilities for resilient data fetching.
 *
 * withTimeout — Races a promise against a timeout. If the promise doesn't
 *   resolve in `ms`, rejects with a timeout error (or returns `fallback`).
 *   Combine with the `safe()` wrapper on pages for graceful degradation:
 *
 *     safe(withTimeout(supabase.from("big_table").select("*"), 5000))
 *
 *   If Supabase is slow, the query times out → safe() catches → page renders
 *   with partial data instead of hanging indefinitely.
 */

export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number = 5000,
  fallback?: T
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Query timeout after ${ms}ms`)), ms)
    ),
  ]).catch((err) => {
    if (fallback !== undefined) return fallback;
    throw err;
  });
}
