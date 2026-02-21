/**
 * Safely parse JSON without throwing.
 * Returns the parsed value on success, or the fallback on failure.
 */
export function safeJsonParse<T = unknown>(
  text: string | undefined | null,
  fallback: T
): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
