/**
 * Next.js 15 Instrumentation Hook
 *
 * This file is auto-discovered by Next.js and runs once at server startup.
 * No config changes needed — Next.js looks for `instrumentation.ts` at the
 * project root automatically.
 *
 * Used for:
 *  1. Env validation (fail fast if .env.local is missing critical vars)
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the Node.js server runtime (skip Edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");

    // In dev, scripts/dev.mjs already validates env by reading .env.local directly.
    // The instrumentation hook may fire before Next.js loads .env.local into process.env,
    // causing false "missing var" warnings. Only validate in production.
    if (process.env.NODE_ENV === "production") {
      validateEnv();
    }
  }
}
